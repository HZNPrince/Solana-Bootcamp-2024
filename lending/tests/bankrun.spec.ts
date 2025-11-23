import { describe, it } from "node:test"
import IDL from "../target/idl/lending.json"
import type { Lending } from "../target/types/lending"
import { BankrunProvider, startAnchor } from "anchor-bankrun"
import { Connection, PublicKey } from "@solana/web3.js"
import { BanksClient, ProgramTestContext } from "solana-bankrun"
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver"
import { BankrunContextWrapper } from "../bankrun-utils/BankrunConnection"
import { BN, Program } from "@coral-xyz/anchor"
import { Keypair } from "@solana/web3.js"
import { createMint, mintTo, createAccount } from "spl-token-bankrun"
import { TOKEN_PROGRAM_ID } from "@solana/spl-token"

describe("Lending Protocol Test", async () => {
  let context: ProgramTestContext
  let provider: BankrunProvider
  let bankrunContextWrapper: BankrunContextWrapper
  let program: Program<Lending>
  let banksClient: BanksClient
  let signer: Keypair
  let usdcBankAccount: PublicKey
  let solBankAccount: PublicKey

  const pyth = new PublicKey("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ")
  const devnetConnection = new Connection("https://api.devnet.solana.com")
  const accountInfo = await devnetConnection.getAccountInfo(pyth)

  context = await startAnchor(
    "",
    [{ name: "lending", programId: new PublicKey(IDL.address) }],
    [{ address: pyth, info: accountInfo }]
  )

  provider = new BankrunProvider(context)

  const SOL_USD_FEED_ID = "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d"

  bankrunContextWrapper = new BankrunContextWrapper(context)
  const connection = bankrunContextWrapper.connection.toConnection()

  const pythSolanaReceiver = new PythSolanaReceiver({ connection, wallet: provider.wallet })

  const solUsdPriceFeedAccount = pythSolanaReceiver.getPriceFeedAccountAddress(0, SOL_USD_FEED_ID)

  const feedAccountInfo = await devnetConnection.getAccountInfo(solUsdPriceFeedAccount)

  context.setAccount(solUsdPriceFeedAccount, feedAccountInfo)

  program = new Program<Lending>(IDL as Lending, provider)

  banksClient = context.banksClient
  signer = provider.wallet.payer

  const mintUSDC = await createMint(banksClient, signer, signer.publicKey, null, 2)
  const mintSOL = await createMint(banksClient, signer, signer.publicKey, null, 2)

  ;[usdcBankAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury"), mintUSDC.toBuffer()],
    program.programId
  )
  ;[solBankAccount] = PublicKey.findProgramAddressSync([Buffer.from("treasury"), mintSOL.toBuffer()], program.programId)

  // Test Cases
  it("Test Init and Fund USDC Bank", async () => {
    const initUSDCBankTx = await program.methods
      .initBank(new BN(1), new BN(1))
      .accounts({
        signer: signer.publicKey,
        mint: mintUSDC,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({ commitment: "confirmed" })

    console.log("Create USDC Bank Account", initUSDCBankTx)

    const amount = 10_000 * 10 ** 9

    const mintTx = await mintTo(banksClient, signer, mintUSDC, usdcBankAccount, signer, amount)
    console.log("Mint USDC to Bank", mintTx)
  })
  it("Test Init User", async () => {
    const initUserTx = await program.methods
      .initUser(mintUSDC)
      .accounts({ signer: signer.publicKey })
      .rpc({ commitment: "confirmed" })
  })

  it("Test Init and Fund Sol Bank", async () => {
    const initSolBankTx = await program.methods
      .initBank(new BN(2), new BN(1))
      .accounts({
        signer: signer.publicKey,
        mint: mintSOL,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({ commitment: "confirmed" })

    console.log("Create Sol Bank Account", initSolBankTx)

    const amount = 10_000 * 10 ** 9

    const mintTx = await mintTo(banksClient, signer, mintSOL, solBankAccount, signer, amount)

    console.log("Mint SOL to Bank", mintTx)
  })
  it("Create and Fund Token Accounts", async () => {
    const USDCTokenAccount = createAccount(banksClient, signer, mintUSDC, signer.publicKey)
    console.log("USDC Token Account: ", USDCTokenAccount)

    const amount = 10_000 * 10 ** 9

    const mintUSDCTx = mintTo(banksClient, signer, mintUSDC, USDCTokenAccount, signer, amount)
    console.log("Mint USDC to User : ", mintUSDCTx)
  })

  it("Test Deposit", async () => {
    const depositUSDC = await program.methods
      .deposit(new BN(100_000_000_000))
      .accounts({
        signer: signer.publicKey,
        mint: mintUSDC,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({ commitment: "confirmed" })
  })

  it("Test Borrow", async () => {
    const borrowSol = await program.methods
      .borrow(new BN(1))
      .accounts({
        signer: signer.publicKey,
        mint: mintSOL,
        tokenProgram: TOKEN_PROGRAM_ID,
        priceUpdate: solUsdPriceFeedAccount,
      })
      .rpc({ commitment: "confirmed" })

    console.log("Borrow Sol", borrowSol)
  })

  it("Test Repay Borrowed Amount", async () => {
    const repaySol = await program.methods
      .repay(new BN(1))
      .accounts({
        signer: signer.publicKey,
        mint: mintSOL,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({ commitment: "confirmed" })

    console.log("Repay SOL: ", repaySol)
  })

  it("Test Withdraw remaining Collateral", async () => {
    const withdrawUSDC = await program.methods
      .withdraw(new BN(100))
      .accounts({
        signer: signer.publicKey,
        mint: mintUSDC,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({ commitment: "confirmed" })

    console.log("Withdraw Collateral USDC: ", withdrawUSDC)
  })
})
