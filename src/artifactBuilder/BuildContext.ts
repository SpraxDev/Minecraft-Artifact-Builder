// TODO: Does workspacePath even sense? What do we need to provide here exactly?
export default interface BuildContext {
  readonly workspacePath: string;
  readonly outputDirectory: string;
}
