use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked},
};
use pyth_solana_receiver_sdk::price_update::{get_feed_id_from_hex, PriceUpdateV2};

use crate::{
    constants::{MAXIMUM_AGE, SOL_USDC_FEED_ID, USDC_USD_FEED_ID},
    errors::LendingError,
    instructions::calculate_accrued_interest,
    state::{Bank, User},
};

#[derive(Accounts)]
pub struct Liquidate<'info> {
    #[account(mut)]
    pub liquidator: Signer<'info>,

    pub price_update: Account<'info, PriceUpdateV2>,

    pub collateral_mint: InterfaceAccount<'info, Mint>,

    pub borrowed_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        seeds = [collateral_mint.key().as_ref()],
        bump,
    )]
    pub collateral_bank: Account<'info, Bank>,

    #[account(
        mut,
        seeds = [borrowed_mint.key().as_ref()],
        bump,
    )]
    pub borrowed_bank: Account<'info, Bank>,

    #[account(
        mut,
        seeds = [b"treasury", collateral_mint.key().as_ref()],
        bump,
    )]
    pub collateral_bank_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"treasury", borrowed_mint.key().as_ref()],
        bump,
    )]
    pub borrowed_bank_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [liquidator.key().as_ref()],
        bump,
    )]
    pub user_account: Account<'info, User>,

    #[account(
        init_if_needed,
        payer = liquidator,
        associated_token::mint = collateral_mint,
        associated_token::authority = liquidator,
        associated_token::token_program = token_program,
    )]
    pub liquidator_collateral_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = liquidator,
        associated_token::mint = borrowed_mint,
        associated_token::authority = liquidator,
        associated_token::token_program = token_program,
    )]
    pub liquidator_borrowed_token_account: InterfaceAccount<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn process_liquidate(ctx: Context<Liquidate>) -> Result<()> {
    let collateral_bank = &mut ctx.accounts.collateral_bank;
    let borrowed_bank = &mut ctx.accounts.borrowed_bank;
    let user = &mut ctx.accounts.user_account;

    let price_update = &mut ctx.accounts.price_update;

    // Sol Price
    let sol_feed_id = get_feed_id_from_hex(SOL_USDC_FEED_ID)?;
    let sol_value =
        price_update.get_price_no_older_than(&Clock::get()?, MAXIMUM_AGE, &sol_feed_id)?;

    // USDC Price
    let usdc_feed_id = get_feed_id_from_hex(USDC_USD_FEED_ID)?;
    let usdc_value =
        price_update.get_price_no_older_than(&Clock::get()?, MAXIMUM_AGE, &usdc_feed_id)?;

    let total_collateral: u64;
    let total_borrowed: u64;
    match ctx.accounts.collateral_mint.to_account_info().key() {
        // To calculate the health factor
        key if key == user.usdc_address => {
            let new_usdc = calculate_accrued_interest(
                user.deposited_usdc,
                collateral_bank.interest_rate,
                user.last_updated,
            )?;
            total_collateral = usdc_value.price as u64 * new_usdc;

            let new_sol = calculate_accrued_interest(
                user.borrowed_sol,
                borrowed_bank.interest_rate,
                user.last_updated_borrow,
            )?;
            total_borrowed = sol_value.price as u64 * new_sol;
        }
        _ => {
            let new_sol = calculate_accrued_interest(
                user.deposited_sol,
                collateral_bank.interest_rate,
                user.last_updated,
            )?;
            total_collateral = new_sol * sol_value.price as u64;
            let new_usdc = calculate_accrued_interest(
                user.borrowed_usdc,
                borrowed_bank.interest_rate,
                user.last_updated_borrow,
            )?;
            total_borrowed = new_usdc * usdc_value.price as u64;
        }
    }

    // Calculate the Health-Factor : (Total Collateral / Total Borrowed) * liquidation threshold
    let health_factor = ((total_collateral as f64 * collateral_bank.liquidation_threshold as f64)
        / total_borrowed as f64);
    if health_factor >= 1.0 {
        return Err(LendingError::NotUnderCollateralized.into());
    }

    // Process the liquidation

    // 1) Liquidator has to pay back to the bank
    let transfer_to_bank_accounts = TransferChecked {
        from: ctx
            .accounts
            .liquidator_borrowed_token_account
            .to_account_info(),
        to: borrowed_bank.to_account_info(),
        mint: ctx.accounts.borrowed_mint.to_account_info(),
        authority: ctx.accounts.liquidator.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        transfer_to_bank_accounts,
    );
    let decimals = ctx.accounts.borrowed_mint.decimals;
    let liquidation_amount = total_borrowed
        .checked_mul(borrowed_bank.liquidation_close_factor as u64)
        .unwrap();
    token_interface::transfer_checked(cpi_ctx, liquidation_amount, decimals)?;

    // 2) To the liquidator with an bonus for saving the protocol
    let liquidator_amount =
        (liquidation_amount * collateral_bank.liquidation_bonus) + liquidation_amount;

    let transfer_to_liquidator_accounts = TransferChecked {
        from: collateral_bank.to_account_info(),
        to: ctx
            .accounts
            .liquidator_collateral_token_account
            .to_account_info(),
        mint: ctx.accounts.collateral_mint.to_account_info(),
        authority: collateral_bank.to_account_info(),
    };
    let collateral_mint_key = &mut ctx.accounts.collateral_mint.key();
    let signer_seeds: &[&[&[u8]]] = &[&[
        b"treasury",
        collateral_mint_key.as_ref(),
        &[ctx.bumps.collateral_bank_token_account],
    ]];

    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        transfer_to_liquidator_accounts,
    )
    .with_signer(signer_seeds);

    let decimals = ctx.accounts.collateral_mint.decimals;

    token_interface::transfer_checked(cpi_ctx, liquidator_amount, decimals)?;

    Ok(())
}
