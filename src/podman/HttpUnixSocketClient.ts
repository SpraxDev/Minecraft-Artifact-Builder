import Http from 'node:http';

export type HttpResponse = {
  statusCode: number;
  headers: Http.IncomingHttpHeaders;
  body: Buffer;
}

export default class HttpUnixSocketClient {
  private readonly socketPath: string;

  constructor(socketPath: string) {
    this.socketPath = socketPath;
  }

  async get(path: string): Promise<HttpResponse> {
    return this.handleResponse(await this.doGetRequest(path));
  }

  async post(path: string, body: object | Buffer | null, contentType = 'application/json'): Promise<HttpResponse> {
    return this.handleResponse(await this.doPostRequest(path, body, contentType));
  }

  async delete(path: string): Promise<HttpResponse> {
    return this.handleResponse(await this.doDeleteRequest(path));
  }

  private async handleResponse(response: Http.IncomingMessage): Promise<HttpResponse> {
    let buffers: Buffer[] = [];

    response.on('data', (chunk) => buffers.push(chunk));
    return new Promise((resolve, reject) => {
      response.on('error', (error) => reject(error));

      response.on('end', () => resolve({
        statusCode: response.statusCode!,
        headers: response.headers,
        body: Buffer.concat(buffers)
      }));
    });
  }

  private async doGetRequest(path: string): Promise<Http.IncomingMessage> {
    return new Promise((resolve, reject) => {
      Http.request({
          socketPath: this.socketPath,
          path: path,
          headers: {
            accept: 'application/json'
          }
        },
        (response) => resolve(response))
        .on('error', (error) => reject(error))
        .end();
    });
  }

  private async doPostRequest(path: string, body: object | Buffer | null, contentType: string): Promise<Http.IncomingMessage> {
    return new Promise((resolve, reject) => {
      const bodyBuffer = body != null ? (Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body))) : Buffer.alloc(0);

      Http.request({
          method: 'POST',
          socketPath: this.socketPath,
          path: path,
          headers: {
            'accept': 'application/json',
            'Content-Type': contentType,
            'Content-Length': bodyBuffer.length
          }
        },
        (response) => resolve(response))
        .on('error', (error) => reject(error))
        .end(bodyBuffer);
    });
  }

  private async doDeleteRequest(path: string): Promise<Http.IncomingMessage> {
    return new Promise((resolve, reject) => {
      Http.request({
          socketPath: this.socketPath,
          path: path,
          method: 'DELETE'
        },
        (response) => resolve(response))
        .on('error', (error) => reject(error))
        .end();
    });
  }
}
