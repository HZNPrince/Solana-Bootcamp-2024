// Here we export some useful types and functions for interacting with the Anchor program.
import { Account, getBase58Decoder, SolanaClient } from 'gill'
import { getProgramAccountsDecoded } from './helpers/get-program-accounts-decoded'
import { Tokenvesting, TOKENVESTING_DISCRIMINATOR, TOKENVESTING_PROGRAM_ADDRESS, getTokenvestingDecoder } from './client/js'
import TokenvestingIDL from '../target/idl/tokenvesting.json'

export type TokenvestingAccount = Account<Tokenvesting, string>

// Re-export the generated IDL and type
export { TokenvestingIDL }

export * from './client/js'

export function getTokenvestingProgramAccounts(rpc: SolanaClient['rpc']) {
  return getProgramAccountsDecoded(rpc, {
    decoder: getTokenvestingDecoder(),
    filter: getBase58Decoder().decode(TOKENVESTING_DISCRIMINATOR),
    programAddress: TOKENVESTING_PROGRAM_ADDRESS,
  })
}
