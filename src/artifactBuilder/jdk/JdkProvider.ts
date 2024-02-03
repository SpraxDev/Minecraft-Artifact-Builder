import ChildProcess from 'node:child_process';
import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import FileDownloader from '../FileDownloader';
import Jdk from './Jdk';

export default class JdkProvider {
  public static readonly CLASS_VERSION_TO_JDK_VERSION: { [majorClassVersion: number]: number } = {
    51: 7,
    52: 8,
    53: 9,
    54: 10,
    55: 11,
    56: 12,
    57: 13,
    58: 14,
    59: 15,
    60: 16,
    61: 17,
    62: 18,
    63: 19,
    64: 20,
    65: 21,
    66: 22,
    67: 23
  };

  private static readonly ECLIPSE_TEMURIN_JDKS: { [jdkVersion: number]: string } = {
    21: `https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.2%2B13/OpenJDK21U-jdk_${Os.arch()}_${JdkProvider.isRunningOnAlpineLinux() ? 'alpine-' : ''}linux_hotspot_21.0.2_13.tar.gz`,
    20: `https://github.com/adoptium/temurin20-binaries/releases/download/jdk-20.0.2%2B9/OpenJDK20U-jdk_${Os.arch()}_${JdkProvider.isRunningOnAlpineLinux() ? 'alpine-' : ''}linux_hotspot_20.0.2_9.tar.gz`,
    19: `https://github.com/adoptium/temurin19-binaries/releases/download/jdk-19.0.2%2B7/OpenJDK19U-jdk_${Os.arch()}_${JdkProvider.isRunningOnAlpineLinux() ? 'alpine-' : ''}linux_hotspot_19.0.2_7.tar.gz`,
    18: `https://github.com/adoptium/temurin18-binaries/releases/download/jdk-18.0.2.1%2B1/OpenJDK18U-jdk_${Os.arch()}_${JdkProvider.isRunningOnAlpineLinux() ? 'alpine-' : ''}linux_hotspot_18.0.2.1_1.tar.gz`,
    17: `https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.10%2B7/OpenJDK17U-jdk_${Os.arch()}_${JdkProvider.isRunningOnAlpineLinux() ? 'alpine-' : ''}linux_hotspot_17.0.10_7.tar.gz`,
    16: `https://github.com/adoptium/temurin16-binaries/releases/download/jdk-16.0.2%2B7/OpenJDK16U-jdk_${Os.arch()}_${JdkProvider.isRunningOnAlpineLinux() ? 'alpine-' : ''}linux_hotspot_16.0.2_7.tar.gz`,
    11: `https://github.com/adoptium/temurin11-binaries/releases/download/jdk-11.0.22%2B7/OpenJDK11U-jdk_${Os.arch()}_${JdkProvider.isRunningOnAlpineLinux() ? 'alpine-' : ''}linux_hotspot_11.0.22_7.tar.gz`,
    8: `https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u402-b06/OpenJDK8U-jdk_${Os.arch()}_${JdkProvider.isRunningOnAlpineLinux() ? 'alpine-' : ''}linux_hotspot_8u402b06.tar.gz`
  };

  // TODO: refactor
  async provide(jdkVersion: number): Promise<Jdk> {
    const jdkUrl = JdkProvider.ECLIPSE_TEMURIN_JDKS[jdkVersion];
    if (jdkUrl == null) {
      throw new Error(`JDK ${jdkVersion} is not supported`);
    }

    const jdkDir = Path.join(Os.tmpdir(), `jdk-${jdkVersion}`); // TODO: Use a dedicated tmp-dir for this project
    if (Fs.existsSync(jdkDir)) {
      return { jdkVersion, javaHomePath: jdkDir };
    }

    const jdkTarPath = Path.join(jdkDir, 'jdk.tar.gz');

    console.log('Downloading JDK', jdkVersion);
    await Fs.promises.mkdir(jdkDir, { recursive: true });
    await FileDownloader.downloadFile(jdkUrl, jdkTarPath);

    await new Promise<void>((resolve, reject) => {
      const tarProcess = ChildProcess.spawn(
        'tar',
        ['-xf', jdkTarPath, '--strip-components=1'],
        {
          cwd: jdkDir,
          stdio: ['ignore', 'inherit', 'inherit']
        });

      tarProcess.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Failed to extract JDK ${jdkVersion} archive: tar exited with code ${code}`));
          return;
        }

        resolve();
      });
    });

    await Fs.promises.unlink(jdkTarPath);

    if (!Fs.existsSync(Path.join(jdkDir, 'bin', 'java'))) {
      throw new Error(`Failed to extract JDK ${jdkVersion} archive: java binary not found at bin/java`);
    }

    console.log('JDK', jdkVersion, 'downloaded to', jdkDir);
    return { jdkVersion, javaHomePath: jdkDir };
  }

  public static canProvide(jdkVersion: number): boolean {
    return jdkVersion in JdkProvider.ECLIPSE_TEMURIN_JDKS;
  }

  private static isRunningOnAlpineLinux(): boolean {
    return Fs.existsSync('/etc/alpine-release');
  }
}
