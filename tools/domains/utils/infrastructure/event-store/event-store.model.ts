import { Subscription } from 'rxjs';
import { IUserToken } from 'src/shared/auth';

export interface IEventStore<T = any> {
  appendToStream(payload: {
    user: IUserToken;
    stream: string;
    key: string;
    type: string;
    event: Partial<T> | Partial<T[]>;
  }): Promise<void>;
  subscribeToStream<T>(
    stream: string,
    opts: StoreSubscriptionOptions<T>,
  ): Subscription;
  catchupStream<T>(
    stream: string,
    opts: StoreSubscriptionOptions<T>,
  ): Promise<bigint | undefined>;
  getStreamRevision(stream: string): Promise<bigint | null>;
}

export interface StoreSubscriptionOptions<T> {
  fromSequence?: bigint;
  onEvent: (evt: T, meta: IEventStoreMeta) => void;
}
export interface IEventStoreMeta {
  stream: string;
  tenant: string;
  key: string;
  type: string;
  date: Date;
  sequence: bigint;
  revision: bigint | undefined;
  isLive: boolean;
  version?: string;
}
