import Fs from 'node:fs';
import Os from 'node:os';

export default class FileDownloader {
  static async downloadFile(url: string, destination: string): Promise<void> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': `Minecraft-Artefact-Builder/VERSION_HERE (${Os.type()}; ${process.arch}; ${process.platform})` // FIXME: app version
      }
    });
    if (!response.ok) {
      throw new Error(`Failed to download file from ${url}: ${response.status} ${response.statusText}`);
    }
    if (response.body == null) {
      throw new Error(`Failed to download file from ${url}: response.body is null`);
    }

    await Fs.promises.writeFile(destination, response.body);
  }
}
