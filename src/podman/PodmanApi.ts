import ChildProcess from 'node:child_process';
import Path from 'node:path';
import HttpUnixSocketClient from './HttpUnixSocketClient.ts';

export type LibPodPingResponse = {
  apiVersion: string;
  buildKitVersion: string;
  dockerExperimental: boolean;
  libPodApiVersion: string;
  libpodBuildahVersion: string;
};

export type ContainerCondition =
  'configured'
  | 'created'
  | 'exited'
  | 'healthy'
  | 'initialized'
  | 'paused'
  | 'removing'
  | 'running'
  | 'stopped'
  | 'stopping'
  | 'unhealthy';

export type ContainerMount = { type: 'bind', source: string, destination: string, options: string[] }
                             | { type: 'tmpfs', destination: string };

export type OverlayVolume = {
  source: string;
  destination: string;
  options: string[];
}

export type ContainerInfo = {
  AutoRemove: boolean;
  Command: string[];
  Created: string;
  CreatedAt: string;
  CIDFile: string;
  Exited: boolean;
  ExitedAt: number;
  ExitCode: number;
  Id: string;
  Image: string;
  ImageID: string;
  IsInfra: boolean;
  Labels: { [key: string]: '1' | string };
  Mounts: string[];
  Names: string[];
  Namespaces: unknown;
  Networks: unknown[];
  Pid: number;
  Pod: string;
  PodName: string;
  Ports: null | unknown;
  Restarts: number;
  Size: null | unknown;
  StartedAt: number;
  State: string;
  Status: string;
};

export type ContainerConfig = {
  name?: string;
  image: string;
  command: string[];
  user?: string;
  labels?: { [key: string]: '1' | string };
  /** indicates if the container should be removed once it has been started and exits */
  remove?: boolean;
  mounts?: ContainerMount[];
  /** specifies whether the container storage can be optimized at the cost of not syncing all the dirty files in memory */
  volatile?: boolean;
  // volumes?: NamedVolumes[];
  overlay_volumes?: OverlayVolume[];
  work_dir?: string;
  create_working_dir?: boolean;
  no_new_privileges?: boolean;
  read_only_filesystem?: boolean;
  dns_server?: string;
};

export type ContainerListFilters = {
  /** <image-name>[:<tag>], <image id>, or <image@digest> */
  ancestor?: string;
  /** <container id> or <container name> */
  before?: string;
  /** <port>[/<proto>] or <startport-endport>/[<proto>] */
  expose?: string;
  /** containers with exit code of <int> */
  exited?: string;
  health?: 'starting' | 'healthy' | 'unhealthy' | 'none';
  /** a container's ID */
  id?: string;
  'is-task'?: 'true' | 'false';
  /** (key or "key=value") of a container label */
  label?: string;
  /** a container's name */
  name?: string;
  /** <network id> or <network name> */
  network?: string;
  /** <pod id> or <pod name> */
  pod?: string;
  /** <port>[/<proto>] or <startport-endport>/[<proto>] */
  publish?: string;
  /** <container id> or <container name> */
  since?: string;
  status?: 'created' | 'restarting' | 'running' | 'removing' | 'paused' | 'exited' | 'dead';
  /** <volume name> or <mount point destination> */
  volume?: string;
};

export type PrunedContainer = {
  Id: string;
  Size: number;
}

export default class PodmanApi {
  private readonly httpClient: HttpUnixSocketClient;

  constructor(unixSocketPath: string) {
    this.httpClient = new HttpUnixSocketClient(unixSocketPath);
  }

  async listContainers(onlyRunningContainers: boolean = false, filters?: ContainerListFilters, limit?: number): Promise<ContainerInfo[]> {
    const response = await this.httpClient.get(`/v4.0.0/libpod/containers/json?all=${!onlyRunningContainers}${filters ? '&filters=' + JSON.stringify(filters) : ''}${limit != null ? '&limit=' + limit : ''}`);
    if (response.statusCode !== 200) {
      throw new Error(`Unexpected http status '${response.statusCode}' after container list: ${response.body.toString()}`);
    }

    const containerList = JSON.parse(response.body.toString());
    if (!Array.isArray(containerList)) {
      throw new Error(`Expected container list to return an array: ${response.body.toString()}`);
    }
    return containerList;
  }

  async deleteContainer(idOrName: string, forceStopContainerIfRunning = false, ignoreErrorsIfContainerDoesNotExists = false): Promise<{ Id: string }[]> {
    let queryArgs = '';
    if (forceStopContainerIfRunning) {
      queryArgs += '?force=true';
    }
    if (ignoreErrorsIfContainerDoesNotExists) {
      queryArgs += queryArgs.length > 0 ? '&ignore=true' : '?ignore=true';
    }

    const response = await this.httpClient.delete(`/v4.0.0/libpod/containers/${encodeURIComponent(idOrName)}${queryArgs}`);
    if (response.statusCode !== 200) {
      throw new Error(`Unexpected http status '${response.statusCode}' after container creation: ${response.body.toString()}`);
    }

    const deletedContainers = JSON.parse(response.body.toString());
    if (!Array.isArray(deletedContainers)) {
      throw new Error(`Expected deleted containers to be an array: ${response.body.toString()}`);
    }
    return deletedContainers;
  }

  async createContainer(containerConfig: ContainerConfig): Promise<string> {
    const response = await this.httpClient.post('/v4.0.0/libpod/containers/create', containerConfig);
    if (response.statusCode !== 201) {
      throw new Error(`Unexpected http status '${response.statusCode}' after container creation: ${response.body.toString()}`);
    }

    const containerId = JSON.parse(response.body.toString())['Id'];
    if (typeof containerId !== 'string') {
      throw new Error('Missing container id after podman create: ' + response.body.toString());
    }
    return containerId;
  }

  async startContainer(idOrName: string): Promise<void> {
    const response = await this.httpClient.post(`/v4.0.0/libpod/containers/${encodeURIComponent(idOrName)}/start`, null);
    if (response.statusCode !== 204) {
      throw new Error(`Unexpected http status '${response.statusCode}' when starting container: ${response.body.toString()}`);
    }
  }

  async waitOnContainer(idOrName: string, conditions: ContainerCondition[]): Promise<number> {
    const response = await this.httpClient.post(`/v4.0.0/libpod/containers/${encodeURIComponent(idOrName)}/wait?condition=${encodeURIComponent(conditions.join(' '))}`, null);
    if (response.statusCode !== 200) {
      throw new Error(`Unexpected http status ${response.statusCode} while waiting on container: ${response.body.toString()}`);
    }

    return parseInt(response.body.toString(), 10);  // TODO: Kommt immer ein exit code raus? Auch bei conditions wo es kein exit gab?
  }

  async deleteStoppedContainers(filters: { until?: (Date | string)[], label?: string[] }): Promise<PrunedContainer[]> {
    const response = await this.httpClient.post(`/v4.0.0/libpod/containers/prune${filters ? '?filters=' + encodeURIComponent(JSON.stringify({
      label: filters.label,
      until: filters.until?.map(date => typeof date === 'string' ? date : date.toISOString())
    })) : ''}`, null);
    if (response.statusCode !== 200) {
      throw new Error(`Unexpected http status '${response.statusCode}' after container creation: ${response.body.toString()}`);
    }

    const deletedContainers = JSON.parse(response.body.toString());
    if (!Array.isArray(deletedContainers)) {
      throw new Error(`Expected deleted containers to be an array: ${response.body.toString()}`);
    }
    return deletedContainers;
  }

  async getContainerLogs(idOrName: string): Promise<string> {
    const response = await this.httpClient.get(`/v4.0.0/libpod/containers/${encodeURIComponent(idOrName)}/logs?stdout=true&stderr=true`);
    if (response.statusCode !== 200) {
      throw new Error(`Unexpected http status ${response.statusCode} while waiting on container: ${response.body.toString()}`);
    }
    if (response.headers['content-type'] !== undefined && response.headers['content-type'] !== 'application/octet-stream') {
      throw new Error(`Unexpected Content-Type for container log stream: contentType=${response.headers['content-type']}, idOrName=${idOrName}`);
    }

    let leftBytes = response.body;
    let result: string = '';
    let lastAppendedStreamType: number = -1;

    while (leftBytes.length > 0) {
      const headerBytes = leftBytes.subarray(0, 8);
      const streamType = headerBytes[0];
      const frameSize = headerBytes[4] << 24 | headerBytes[5] << 16 | headerBytes[6] << 8 | headerBytes[7];
      const payloadBytes = leftBytes.subarray(8, 8 + frameSize);
      leftBytes = leftBytes.subarray(8 + frameSize);

      if (streamType !== lastAppendedStreamType) {
        if (streamType === 1) {
          result += '\n[stdout] ';
        } else if (streamType === 2) {
          result += '\n[stderr] ';
        } else {
          throw new Error('Encountered unknown stream type: ' + streamType);
        }
      }
      result += payloadBytes.toString();
      lastAppendedStreamType = streamType;
    }

    return result;
  }

  async pullImage(reference: string, policy: 'always' | 'missing' | 'never' | 'newer' = 'newer'): Promise<string> {
    const response = await this.httpClient.post(`/v4.0.0/libpod/images/pull?reference=${encodeURIComponent(reference)}&quiet=true&policy=${policy}`, null);
    if (response.statusCode !== 200) {
      throw new Error(`Unexpected http status '${response.statusCode}' after podman pull: ${response.body.toString()}`);
    }

    const imageId = JSON.parse(response.body.toString()).id;
    if (typeof imageId !== 'string') {
      throw new Error(`Missing image id after podman pull: ${response.body.toString()}`);
    }
    return imageId;
  }

  async buildImage(containerFilePath: string, nameAndOptionalTag: string, labels?: { [key: string]: string }): Promise<string> {
    const response = await this.httpClient.post(`/v4.0.0/libpod/build?q=true&pull=true&t=${nameAndOptionalTag}&dockerfile=${encodeURIComponent(Path.basename(containerFilePath))}${labels ? '&labels=' + encodeURIComponent(JSON.stringify(labels)) : ''}`, await this.tarDirectory(Path.dirname(containerFilePath)), 'application/x-tar');
    if (response.statusCode !== 200) {
      throw new Error(`Unexpected status code ${response.statusCode}`);
    }

    const imageId = JSON.parse(response.body.toString().trim()).stream;
    if (typeof imageId !== 'string') {
      throw new Error(`Missing image id after podman build: ${response.body.toString()}`);
    }
    return imageId;
  }

  async ping(): Promise<LibPodPingResponse> {
    const response = await this.httpClient.get('/v4.0.0/libpod/_ping');
    if (response.statusCode !== 200) {
      throw new Error(`Unexpected status code ${response.statusCode}`);
    }

    return {
      apiVersion: response.headers['api-version'] as string,
      buildKitVersion: response.headers['buildkit-version'] as string,
      dockerExperimental: response.headers['docker-experimental'] === 'true',
      libPodApiVersion: response.headers['libpod-api-version'] as string,
      libpodBuildahVersion: response.headers['libpod-buildah-version'] as string
    };
  }

  private async tarDirectory(path: string): Promise<Buffer> {
    const tarProcess = ChildProcess.spawn('tar', ['--create', '.'], { stdio: ['ignore', 'pipe', 'inherit'], cwd: path });
    return new Promise((resolve, reject) => {
      tarProcess.on('error', (err) => reject(err));
      tarProcess.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`tar exited with exit code ${code}`));
        }
      });

      const buffers: Buffer[] = [];
      tarProcess.stdout.on('data', (chunk) => {
        buffers.push(chunk);
      });
      tarProcess.stdout.on('end', () => {
        resolve(Buffer.concat(buffers));
      });
    });
  }
}
