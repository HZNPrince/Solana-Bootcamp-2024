import * as anchor from '@coral-xyz/anchor'
import { Keypair, PublicKey } from '@solana/web3.js'
import { BanksClient, Clock, ProgramTestContext, startAnchor } from 'solana-bankrun'
import { BankrunProvider } from 'anchor-bankrun'
import { createMint, mintTo } from 'spl-token-bankrun'

import { Tokenvesting } from '../target/types/tokenvesting'
import IDL from '../target/idl/tokenvesting.json'

import { SYSTEM_PROGRAM_ID } from '@coral-xyz/anchor/dist/cjs/native/system'
import { Program } from '@coral-xyz/anchor'
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet'
import { TOKEN_PROGRAM_ID } from '@coral-xyz/anchor/dist/cjs/utils/token'
import { BN } from '@coral-xyz/anchor'

describe('Vesting Program Tests', () => {
  const companyName = 'companyName'
  let beneficiary: Keypair
  let context: ProgramTestContext
  let provider: BankrunProvider
  let program: Program<Tokenvesting>
  let banksClient: BanksClient
  let employer: Keypair
  let mint: PublicKey
  let beneficiaryProvider: BankrunProvider
  let program2: Program<Tokenvesting>
  let vestingAccountKey: PublicKey
  let treasuryTokenAccount: PublicKey
  let employeeAccount: PublicKey

  beforeAll(async () => {
    beneficiary = new anchor.web3.Keypair()

    context = await startAnchor(
      '',
      [{ name: 'tokenvesting', programId: new PublicKey(IDL.address) }],
      [
        {
          address: beneficiary.publicKey,
          info: {
            lamports: 1_000_000_000,
            data: Buffer.alloc(0),
            owner: SYSTEM_PROGRAM_ID,
            executable: false,
          },
        },
      ],
    )
    provider = new BankrunProvider(context)

    anchor.setProvider(provider)

    program = new Program<Tokenvesting>(IDL as Tokenvesting, provider)

    banksClient = context.banksClient

    employer = provider.wallet.payer

    // @ts-expect-error - Type Error in spl-token-bankrun dependency
    mint = await createMint(banksClient, employer, employer.publicKey, null, 2)

    beneficiaryProvider = new BankrunProvider(context)
    beneficiaryProvider.wallet = new NodeWallet(beneficiary)

    program2 = new Program<Tokenvesting>(IDL as Tokenvesting, beneficiaryProvider)
    ;[vestingAccountKey] = PublicKey.findProgramAddressSync([Buffer.from(companyName)], program.programId)
    ;[treasuryTokenAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('vesting_treasury'), Buffer.from(companyName)],
      program.programId,
    )
    ;[employeeAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('employee_vesting'), beneficiary.publicKey.toBuffer(), vestingAccountKey.toBuffer()],
      program.programId,
    )
  })

  it('should create a vesting account', async () => {
    const tx = await program.methods
      .createVestingToken(companyName)
      .accounts({
        signer: employer.publicKey,
        mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({ commitment: 'confirmed' })

    const vestingAccountData = await program.account.vestingAccount.fetch(vestingAccountKey, 'confirmed')

    console.log('Vesting Account Data : ', vestingAccountData, null, 2)
    console.log(`Create Vesting Account: ${tx}`)
  })

  it('should fun the treasury token account', async () => {
    const amount = 10_000 * 10 ** 9
    const mintTx = await mintTo(
      // @ts-expect-error - Type Error in spl-token-bankrun dependency
      banksClient,
      employer,
      mint,
      treasuryTokenAccount,
      employer,
      amount,
    )

    console.log('Mint Token Treasury account : ', mintTx)
  })

  it('should create employee vesting account', async () => {
    const tx2 = await program.methods
      .createEmployeeAccount(new BN(0), new BN(100), new BN(100), new BN(0))
      .accounts({ beneficiary: beneficiary.publicKey, vestingAccount: vestingAccountKey })
      .rpc({ commitment: 'confirmed', skipPreflight: true })

    console.log('create Employee account tx : ', tx2)
    const employeeAccountData = await program.account.employeeAccount.fetch(employeeAccount)
    console.log('Employee Account Data : ', employeeAccountData, null, 2)
  })

  it('should claim the employee vested tokens', async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000))

    const currentClock = await banksClient.getClock()
    new Clock(
      currentClock.slot,
      currentClock.epochStartTimestamp,
      currentClock.epoch,
      currentClock.leaderScheduleEpoch,
      1000n,
    )

    const tx3 = await program2.methods.claimTokens(companyName).accounts({
      tokenProgram: TOKEN_PROGRAM_ID,
    })

    console.log('Claim employee tx: ', tx3)
  })
})
