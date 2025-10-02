import { APP_ROOT, IS_PRODUCTION } from '../../constats.ts';
import PodmanApi from '../../podman/PodmanApi.ts';

export default class PodmanEnvironment {
  private readonly podmanApi: PodmanApi;
  private readonly runningContainerIds: string[] = [];

  constructor(podmanApi: PodmanApi) {
    this.podmanApi = podmanApi;
  }

  async runBuilderInOwnContainer(builderName: string, builderArgs: Map<string, string>, artifactOutDir: string, readOnlyFileSystem = true): Promise<void> {
    //    console.log('Pulling image...');
    //    const imageId = await this.podmanApi.pullImage('minecraft-artifact-builder:latest', 'missing');  // FIXME: Remove debugging policy=missing

    //    console.log('Creating container...');
    const containerId = await this.podmanApi.createContainer({
      image: 'minecraft-artifact-builder:latest',
      //      user: 'node', // FIXME: socket permission denied
      command: IS_PRODUCTION ? ['node', '--enable-source-maps', 'dist/main.js'] : ['node', 'src/main.ts', 'builder', builderName, '--builderArg', ...Array.from(builderArgs.entries()).map(([key, value]) => `${key}=${value}`)],
      work_dir: '/app',
      mounts: [
        {
          type: 'bind',
          source: APP_ROOT,
          destination: '/app/',
          options: ['ro']
        },
        {
          type: 'bind',
          source: artifactOutDir,
          destination: '/artifact_out/',
          options: ['rw']
        },
        {
          type: 'bind',
          source: '/run/user/1000/podman/podman.sock',
          destination: '/run/user/1000/podman/podman.sock',
          options: ['ro']
        },
        {
          type: 'tmpfs',
          destination: '/tmp/'
        }
      ],
      volatile: true,
      no_new_privileges: true,
      read_only_filesystem: readOnlyFileSystem,
      labels: { 'dev.sprax.minecraft-artifact-builder': '1' }
    });

    //    console.log('Starting container...');
    this.runningContainerIds.push(containerId);
    await this.podmanApi.startContainer(containerId);

    //    console.log('Waiting for container to finish...');
    const exitCode = await this.podmanApi.waitOnContainer(containerId, ['exited']);
    if (exitCode !== 0) {
      let containerLogs = '';
      try {
        containerLogs = await this.podmanApi.getContainerLogs(containerId);
        containerLogs = containerLogs.split('\n').slice(-250).join('\n');
      } catch (error) {
        if ((error instanceof Error) && !error.message.includes('no such container')) {
          console.error('Error while fetching container logs:', error);
        }
      }

      await this.podmanApi.deleteContainer(containerId, false, true);
      throw new Error(`Container exited with exit code ${exitCode}${containerLogs ? ': ' + containerLogs : ''}`);
    }

    await this.podmanApi.deleteContainer(containerId);
    this.runningContainerIds.splice(this.runningContainerIds.indexOf(containerId), 1);
  }

  async abortRunningBuilders(): Promise<void> {
    const promises: Promise<unknown>[] = [];
    for (const containerId of this.runningContainerIds) {
      promises.push(this.podmanApi.deleteContainer(containerId, true, true));
    }
    await Promise.all(promises);
  }
}
