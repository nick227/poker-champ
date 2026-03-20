export type DealerProgressionDeps = {
  requestDriveImpl: (trigger: string) => Promise<void>;
  queueDriveImpl: (trigger: string) => void;
};

export class DealerProgressionCoordinator {
  constructor(private readonly deps: DealerProgressionDeps) {}

  requestDrive(trigger: string): Promise<void> {
    return this.deps.requestDriveImpl(trigger);
  }

  queueDrive(trigger: string): void {
    this.deps.queueDriveImpl(trigger);
  }
}
