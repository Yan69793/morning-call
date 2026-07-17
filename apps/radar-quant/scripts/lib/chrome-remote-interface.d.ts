// O pacote `chrome-remote-interface` não publica tipos próprios nem tem @types
// no DefinitelyTyped. Declaração mínima, só com a superfície usada aqui
// (Runtime.evaluate, Page.enable, close) — não é um binding completo do CDP.
declare module 'chrome-remote-interface' {
  interface EvaluateParams {
    expression: string
    returnByValue?: boolean
    awaitPromise?: boolean
  }

  interface EvaluateResult {
    result?: { value?: unknown }
    exceptionDetails?: { text?: string; exception?: { description?: string } }
  }

  interface CDPClient {
    Runtime: {
      enable(): Promise<void>
      evaluate(params: EvaluateParams): Promise<EvaluateResult>
    }
    Page: {
      enable(): Promise<void>
    }
    close(): Promise<void>
  }

  interface CDPOptions {
    host?: string
    port?: number
    target?: string
  }

  function CDP(options?: CDPOptions): Promise<CDPClient>
  export = CDP
}
