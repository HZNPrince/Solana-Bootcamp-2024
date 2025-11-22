use anchor_lang::prelude::*;

#[error_code]
pub enum LendingError {
    #[msg("Insufficient funds in the user account.")]
    InsufficientFunds,
    #[msg("Borrowed amount exceeted the liquidation threshold")]
    BorrowThresholdReached,
    #[msg("The amount repayed was greater than the required amount")]
    RepayAmountExceeded,
    #[msg("The account you are trying to liquidate in not under-collateralized")]
    NotUnderCollateralized,
}
