import { makeNixCommandArgs } from "./nix.js";
import * as actionsCore from "@actions/core";
import * as actionsExec from "@actions/exec";
import { ActionOptions, IdsToolbox, inputs } from "detsys-ts";

const EVENT_EXECUTION_FAILURE = "execution_failure";

class UpdateFlakeLockAction {
  idslib: IdsToolbox;
  private commitMessage: string;
  private nixOptions: string[];
  private flakeInputs: string[];
  private pathToFlakeDir: string | null;

  constructor() {
    const options: ActionOptions = {
      name: "update-flake-lock",
      fetchStyle: "universal",
      requireNix: "fail",
    };

    this.idslib = new IdsToolbox(options);
    this.commitMessage = inputs.getString("commit-msg");
    this.flakeInputs = inputs.getCommaSeparatedArrayOfStrings("inputs", true);
    this.nixOptions = inputs.getCommaSeparatedArrayOfStrings(
      "nix-options",
      true,
    );
    this.pathToFlakeDir = inputs.getStringOrNull("path-to-flake-dir");
  }

  async update(): Promise<void> {
    if (this.pathToFlakeDir !== null) {
      const returnCode = await actionsExec.exec("cd", [this.pathToFlakeDir]);
      if (returnCode !== 0) {
        this.idslib.recordEvent(EVENT_EXECUTION_FAILURE, {
          returnCode,
        });
        actionsCore.setFailed(
          `Error when trying to cd into flake directory ${this.pathToFlakeDir}. Make sure the check that the directory exists.`,
        );
      }
    }

    // Nix command of this form:
    // nix ${maybe nix options} flake lock ${maybe --update-input flags} --commit-lock-file --commit-lock-file-summary ${commit message}
    // Example commands:
    // nix --extra-substituters https://example.com flake lock --update-input nixpkgs --commit-lock-file --commit-lock-file-summary "updated flake.lock"
    // nix flake lock --commit-lock-file --commit-lock-file-summary "updated flake.lock"
    const nixCommandArgs: string[] = makeNixCommandArgs(
      this.nixOptions,
      this.flakeInputs,
      this.commitMessage,
    );

    // Solely for debugging
    const fullNixCommand = `nix ${nixCommandArgs.join(" ")}`;
    actionsCore.debug(`running nix command:\n${fullNixCommand}`);

    const exitCode = await actionsExec.exec("nix", nixCommandArgs);

    if (exitCode !== 0) {
      this.idslib.recordEvent(EVENT_EXECUTION_FAILURE, {
        exitCode,
      });
      actionsCore.setFailed(`non-zero exit code of ${exitCode} detected`);
    } else {
      actionsCore.info(`flake.lock file was successfully updated`);
    }
  }
}

function main(): void {
  const updateFlakeLock = new UpdateFlakeLockAction();

  updateFlakeLock.idslib.onMain(async () => {
    await updateFlakeLock.update();
  });

  updateFlakeLock.idslib.execute();
}

main();
