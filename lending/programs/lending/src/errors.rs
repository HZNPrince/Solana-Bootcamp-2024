use anchor_lang::prelude::*;

#[error_code]
pub enum LendingError {
    #[msg("Insufficient funds in the user account.")]
    InsufficientFunds,
}
