declare function acquireVsCodeApi(): { postMessage: (msg: any) => void };
const vscode = acquireVsCodeApi();

let nextId = 1;
const pending = new Map<string, (res: any) => void>();

window.addEventListener('message', (e) => {
  const msg = e.data as { id: string; result?: any; error?: string };
  const cb = pending.get(msg.id);
  if (cb) { pending.delete(msg.id); cb(msg.error ? Promise.reject(new Error(msg.error)) : msg.result); }
});

export function call<T>(method: string, params?: any): Promise<T> {
  const id = String(nextId++);
  return new Promise<T>((resolve, reject) => {
    pending.set(id, (res) => res?.then ? res.then(resolve, reject) : resolve(res));
    vscode.postMessage({ id, method, params });
  });
}
