// ABOUTME: EventSource implementation backed by an HTTP indexer/REST API.
// ABOUTME: Stub: throws. Feature passes wire in the indexer URLs + response parsing once an indexer exists.

import type { EventSource, FetchRange, RawCommitment, RawNullifier, RawTxLog } from './EventSource'

export class IndexerEventSource implements EventSource {
  readonly baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  async getCommitments(_range: FetchRange): Promise<RawCommitment[]> {
    throw new Error('IndexerEventSource.getCommitments: not implemented (scaffold).')
  }

  async getNullifiers(_range: FetchRange): Promise<RawNullifier[]> {
    throw new Error('IndexerEventSource.getNullifiers: not implemented (scaffold).')
  }

  async getTxHistory(_address: string, _range: FetchRange): Promise<RawTxLog[]> {
    throw new Error('IndexerEventSource.getTxHistory: not implemented (scaffold).')
  }
}
