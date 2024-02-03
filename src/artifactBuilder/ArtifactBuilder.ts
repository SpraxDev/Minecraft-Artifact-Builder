import BuildContext from './BuildContext';

export default interface ArtifactBuilder {
  getKnownVersions(): Promise<string[]>;

  build(context: Readonly<BuildContext>, args: Map<string, string>): Promise<void>;

  /**
   * Returns `null` if it cannot be determined for sure.
   * No write operations to the output directory (or its contents) may be made.
   */
  artifactAlreadyInOutputDir(context: Pick<Readonly<BuildContext>, 'outputDirectory'>, args: Map<string, string>): Promise<boolean | null>;
}
