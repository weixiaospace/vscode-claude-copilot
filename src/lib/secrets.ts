import * as vscode from 'vscode';
import type { SecretsGateway } from '../core/providers';

export function makeSecretsGateway(context: vscode.ExtensionContext): SecretsGateway {
  return {
    async get(key: string) { return context.secrets.get(key); },
    async set(key: string, value: string) { await context.secrets.store(key, value); },
    async delete(key: string) { await context.secrets.delete(key); },
  };
}
