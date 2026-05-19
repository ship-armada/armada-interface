// ABOUTME: EventSource implementation backed by an ethers JsonRpcProvider — direct getLogs against the chain.
// ABOUTME: Stub: returns empty arrays. Feature passes wire in the actual log fetching + ABI decoding.

import type { JsonRpcProvider } from 'ethers'
import type { EventSource, FetchRange, RawCommitment, RawNullifier, RawTxLog } from './EventSource'

export class RpcEventSource implements EventSource {
  readonly provider: JsonRpcProvider
  readonly hubContractAddress: string

  constructor(provider: JsonRpcProvider, hubContractAddress: string) {
    this.provider = provider
    this.hubContractAddress = hubContractAddress
  }

  async getCommitments(_range: FetchRange): Promise<RawCommitment[]> {
    // TODO: chunked getLogs against the privacy-pool address, filtered by Commitment topic.
    return []
  }

  async getNullifiers(_range: FetchRange): Promise<RawNullifier[]> {
    // TODO: chunked getLogs against the privacy-pool address, filtered by Nullifier topic.
    return []
  }

  async getTxHistory(_address: string, _range: FetchRange): Promise<RawTxLog[]> {
    // TODO: chunked getLogs across requested contract(s).
    return []
  }
}
