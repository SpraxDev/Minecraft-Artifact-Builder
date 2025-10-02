import type BuildContext from './BuildContext.ts';

export default abstract class ArtifactBuilder {
  abstract getKnownVersions(): Promise<string[]>;

  abstract build(context: Readonly<BuildContext>, args: Map<string, string>): Promise<void>;

  /**
   * Returns `null` if it cannot be determined for sure.
   * No write operations to the output directory (or its contents) may be made.
   */
  async artifactAlreadyInOutputDir(context: Pick<BuildContext, 'outputDirectory'>, args: Map<string, string>): Promise<boolean | null> {
    return (await this.artifactAlreadyInOutputDirBulk(context, [args]))[0];
  }

  abstract artifactAlreadyInOutputDirBulk(context: Pick<BuildContext, 'outputDirectory'>, args: Map<string, string>[]): Promise<(boolean | null)[]>;
}
