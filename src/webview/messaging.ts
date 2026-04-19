export interface RpcRequest { id: string; method: string; params?: any }
export interface RpcResponse { id: string; result?: any; error?: string }
