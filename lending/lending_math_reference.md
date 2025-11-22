# Lending Protocol Math Reference

Complete formulas and calculations for DeFi lending protocols.

---

## 1. Share-Based Accounting

### Why Shares?
Shares allow interest to accrue automatically without updating every user's balance. The ratio between total deposits and total shares changes as interest accrues.

### Deposit Shares

**Goal:** Calculate how many shares a user receives when depositing

**First Deposit (Pool is Empty):**
```
user_shares = amount
total_deposits = amount
total_deposit_shares = amount
```

**Subsequent Deposits:**
```
user_shares = (amount × total_deposit_shares) / total_deposits

# Then update:
total_deposits += amount
total_deposit_shares += user_shares
```

**Example:**
```
Pool: total_deposits = 1000, total_shares = 1000
User deposits: 100

user_shares = (100 × 1000) / 1000 = 100 shares

After: total_deposits = 1100, total_shares = 1100
```

**After Interest Accrues:**
```
Pool: total_deposits = 1100 (earned 100 in interest), total_shares = 1000
User deposits: 100

user_shares = (100 × 1000) / 1100 = 90.9 ≈ 90 shares

After: total_deposits = 1200, total_shares = 1090
```

### Withdraw Shares

**Goal:** Calculate how many shares to remove when withdrawing amount

```
shares_to_remove = (amount × total_deposit_shares) / total_deposits

# Then update:
user_deposit_shares -= shares_to_remove
total_deposits -= amount
total_deposit_shares -= shares_to_remove
```

### User's Current Value

**Calculate user's actual token value from their shares:**
```
value_per_share = total_deposits / total_deposit_shares
user_value = user_shares × value_per_share
```

**Example:**
```
Pool: total_deposits = 1100, total_shares = 1000
User has: 100 shares

value_per_share = 1100 / 1000 = 1.1
user_value = 100 × 1.1 = 110 tokens

User earned 10 tokens in interest! 🎉
```

---

## 2. Borrow Shares

Same logic as deposit shares, but for borrowed amounts.

**First Borrow:**
```
user_borrow_shares = amount
total_borrowed = amount
total_borrow_shares = amount
```

**Subsequent Borrows:**
```
user_borrow_shares = (amount × total_borrow_shares) / total_borrowed

total_borrowed += amount
total_borrow_shares += user_borrow_shares
```

**Repay:**
```
shares_to_remove = (amount × total_borrow_shares) / total_borrowed

user_borrow_shares -= shares_to_remove
total_borrowed -= amount
total_borrow_shares -= shares_to_remove
```

---

## 3. Interest Calculations

### Simple Interest (Most Common in DeFi)
```
interest = principal × rate × time
new_amount = principal + interest
```

**Example (5% annual, 6 months):**
```
principal = 1000
rate = 0.05
time = 0.5 years

interest = 1000 × 0.05 × 0.5 = 25
new_amount = 1000 + 25 = 1025
```

### Compound Interest (Discrete)
```
new_amount = principal × (1 + rate)^periods
```

**Example (5% annual, compounded monthly for 1 year):**
```
principal = 1000
monthly_rate = 0.05 / 12 = 0.00417
periods = 12

new_amount = 1000 × (1 + 0.00417)^12 = 1051.16
```

### Continuous Compound Interest
```
new_amount = principal × e^(rate × time)
```

**Example (5% annual, 1 year):**
```
new_amount = 1000 × e^(0.05 × 1)
           = 1000 × 2.71828^0.05
           = 1000 × 1.05127
           = 1051.27
```

### Interest Rate in Basis Points (for Solana/integer math)

**Basis Point:** 1 bp = 0.01% = 0.0001

```
interest_rate = 500  // 500 basis points = 5%
decimal_rate = interest_rate / 10_000 = 0.05

interest = (principal × rate × time) / 10_000
```

**Example:**
```
principal = 100_000
rate_bp = 500  // 5%
time_seconds = 31_536_000  // 1 year
seconds_per_year = 31_536_000

interest = (100_000 × 500 × 1) / 10_000 = 5_000
```

---

## 4. Loan-to-Value (LTV) & Health Factor

### LTV Ratio
```
LTV = (borrowed_value / collateral_value) × 100

# Or as decimal:
LTV = borrowed_value / collateral_value
```

**Example:**
```
User deposits: 1000 SOL at $100 = $100,000 collateral
User borrows: $60,000

LTV = (60,000 / 100,000) × 100 = 60%
```

### Max LTV (Maximum Borrowing)
```
max_borrowable = collateral_value × max_ltv

# If max_ltv = 75% (0.75):
max_borrowable = 100,000 × 0.75 = $75,000
```

### Health Factor
```
health_factor = (collateral_value × liquidation_threshold) / borrowed_value
```

**Safe:** `health_factor >= 1.0`  
**Liquidatable:** `health_factor < 1.0`

**Example:**
```
collateral = $100,000
borrowed = $60,000
liquidation_threshold = 80% (0.8)

health_factor = (100,000 × 0.8) / 60,000 = 80,000 / 60,000 = 1.33

Status: Safe ✅
```

**Price Drops:**
```
collateral = $80,000 (SOL price dropped)
borrowed = $60,000
liquidation_threshold = 0.8

health_factor = (80,000 × 0.8) / 60,000 = 64,000 / 60,000 = 1.067

Status: Still safe, but risky! ⚠️
```

**More Price Drop:**
```
collateral = $70,000
borrowed = $60,000

health_factor = (70,000 × 0.8) / 60,000 = 56,000 / 60,000 = 0.93

Status: LIQUIDATABLE! ❌
```

---

## 5. Liquidation Calculations

### Parameters
- **liquidation_threshold:** LTV at which liquidation can occur (e.g., 80%)
- **liquidation_bonus:** Extra collateral liquidator receives (e.g., 5%)
- **liquidation_close_factor:** Max % of debt that can be repaid (e.g., 50%)

### Liquidation Amount
```
max_liquidation = borrowed_value × liquidation_close_factor
```

**Example:**
```
borrowed_value = $60,000
close_factor = 50% (0.5)

max_liquidation = 60,000 × 0.5 = $30,000

Liquidator can repay up to $30,000 of debt
```

### Collateral Seized
```
collateral_seized = liquidation_amount + (liquidation_amount × bonus)
                  = liquidation_amount × (1 + bonus)
```

**Example:**
```
liquidation_amount = $30,000
bonus = 5% (0.05)

collateral_seized = 30,000 × (1 + 0.05) = 30,000 × 1.05 = $31,500

Liquidator pays: $30,000
Liquidator receives: $31,500 in collateral
Liquidator profit: $1,500 🎉
```

### After Liquidation
```
new_borrowed = old_borrowed - liquidation_amount
new_collateral = old_collateral - collateral_seized

new_health_factor = (new_collateral × threshold) / new_borrowed
```

**Example:**
```
Before:
- collateral = $70,000
- borrowed = $60,000
- health_factor = 0.93 (liquidatable)

Liquidation:
- repaid = $30,000
- seized = $31,500

After:
- collateral = 70,000 - 31,500 = $38,500
- borrowed = 60,000 - 30,000 = $30,000
- health_factor = (38,500 × 0.8) / 30,000 = 1.027

Status: Safe again! ✅
```

---

## 6. Multi-Asset Collateral & Borrowing

### Total Collateral Value
```
total_collateral = Σ(amount_i × price_i)
```

**Example:**
```
User has:
- 10 SOL @ $100 = $1,000
- 500 USDC @ $1 = $500

total_collateral = 1,000 + 500 = $1,500
```

### Total Borrowed Value
```
total_borrowed = Σ(amount_i × price_i)
```

**Example:**
```
User borrowed:
- 5 SOL @ $100 = $500
- 200 USDC @ $1 = $200

total_borrowed = 500 + 200 = $700
```

### Health Factor (Multi-Asset)
```
health_factor = (total_collateral × liquidation_threshold) / total_borrowed
```

**Example:**
```
total_collateral = $1,500
total_borrowed = $700
threshold = 80%

health_factor = (1,500 × 0.8) / 700 = 1,200 / 700 = 1.714

Status: Very safe! ✅
```

---

## 7. Fixed-Point Math (For Solana/Integer-Only)

Since Solana doesn't allow floating-point in programs, use **fixed-point arithmetic**.

### Precision Multiplier
```rust
const PRECISION: u64 = 1_000_000_000; // 1 billion (9 decimals)

// Store: rate = 0.05 → 50_000_000 (5% with 9 decimals)
// Calculate: (amount × rate) / PRECISION
```

### Example: Calculate 5% of 1000
```rust
amount = 1000
rate = 50_000_000  // 5% in fixed-point

result = (amount × rate) / PRECISION
       = (1000 × 50_000_000) / 1_000_000_000
       = 50_000_000_000 / 1_000_000_000
       = 50
```

### Shares Calculation (Fixed-Point)
```rust
// user_shares = (amount × total_shares) / total_deposits

let numerator = amount.checked_mul(total_shares).unwrap();
let user_shares = numerator.checked_div(total_deposits).unwrap();
```

---

## 8. Common Pitfalls

### ❌ Wrong: Divide First
```rust
// Integer division truncates!
let ratio = amount / total_deposits;  // Often = 0!
let shares = total_shares * ratio;    // 0 shares!
```

### ✅ Correct: Multiply First
```rust
// Preserve precision
let shares = (amount * total_shares) / total_deposits;
```

### ❌ Wrong: Floating Point
```rust
// Non-deterministic!
let shares = (amount as f64 / total as f64) * shares as f64;
```

### ✅ Correct: Integer Math
```rust
// Deterministic
let shares = amount.checked_mul(total_shares).unwrap()
    .checked_div(total_deposits).unwrap();
```

---

## 9. Quick Reference Table

| Operation | Formula |
|-----------|---------|
| Deposit shares | `(amount × total_shares) / total_deposits` |
| Withdraw shares | `(amount × total_shares) / total_deposits` |
| User value | `(user_shares × total_deposits) / total_shares` |
| LTV | `borrowed_value / collateral_value` |
| Health factor | `(collateral × threshold) / borrowed` |
| Max borrow | `collateral × max_ltv` |
| Liquidation amount | `borrowed × close_factor` |
| Collateral seized | `liquidation × (1 + bonus)` |
| Simple interest | `principal × rate × time` |

---

## 10. Example Scenario (Complete)

**Initial State:**
```
Bank:
- total_deposits = 10,000 SOL
- total_deposit_shares = 10,000
```

**Alice deposits 1000 SOL:**
```
shares = (1000 × 10,000) / 10,000 = 1000
alice.shares = 1000

Bank after:
- total_deposits = 11,000
- total_shares = 11,000
```

**Interest accrues: 1100 SOL earned:**
```
Bank after interest:
- total_deposits = 12,100 (11,000 + 1,100)
- total_shares = 11,000 (unchanged!)
```

**Bob deposits 1100 SOL:**
```
shares = (1100 × 11,000) / 12,100 = 1000
bob.shares = 1000

Bank after:
- total_deposits = 13,200
- total_shares = 12,000
```

**Alice's value:**
```
value_per_share = 13,200 / 12,000 = 1.1
alice_value = 1000 × 1.1 = 1100 SOL

Alice earned 100 SOL in interest! 🎉
```

**Alice withdraws 550 SOL:**
```
shares_to_remove = (550 × 12,000) / 13,200 = 500 shares

alice.shares = 1000 - 500 = 500

Bank after:
- total_deposits = 12,650
- total_shares = 11,500
```

---

This reference covers all the key math for lending protocols! 🎯
