import { EventEmitter } from "events";
import type { ActionProposal, QueueEvents } from "../types";
import { StateManager } from "./StateManager";

export class ActionQueue extends EventEmitter {
  private stateManager: StateManager;
  private queue: ActionProposal[] = [];
  private static instance: ActionQueue;

  constructor() {
    super();
    this.stateManager = StateManager.getInstance();
  }

  public static getInstance(): ActionQueue {
    if (!ActionQueue.instance) {
      ActionQueue.instance = new ActionQueue();
    }
    return ActionQueue.instance;
  }

  public add(proposals: ActionProposal | ActionProposal[]): void {
    try {
      const proposalsArray = Array.isArray(proposals) ? proposals : [proposals];

      proposalsArray.forEach((proposal) => {
        this.queue.push({
          ...proposal,
          status: proposal.status || "pending",
        });
        this.emit("proposalAdded", proposal);
      });
    } catch (error) {
      console.error("Failed to add proposals to queue:", error);
      throw error;
    }
  }

  public remove(id: string): void {
    try {
      const index = this.queue.findIndex((p) => p.id === id);
      if (index !== -1) {
        this.queue.splice(index, 1);
        this.emit("proposalRemoved", id);
      }
    } catch (error) {
      console.error("Failed to remove proposal from queue:", error);
      throw error;
    }
  }

  public update(proposal: ActionProposal): void {
    try {
      const index = this.queue.findIndex((p) => p.id === proposal.id);
      if (index !== -1) {
        this.queue[index] = proposal;
        this.emit("proposalUpdated", proposal);
      }
    } catch (error) {
      console.error("Failed to update proposal in queue:", error);
      throw error;
    }
  }

  public clear(): void {
    try {
      this.queue = [];
      this.emit("queueCleared");
    } catch (error) {
      console.error("Failed to clear queue:", error);
      throw error;
    }
  }

  public getAll(): ActionProposal[] {
    return [...this.queue];
  }

  public getPending(): ActionProposal[] {
    return this.queue.filter((p) => p.status === "pending");
  }

  public getById(id: string): ActionProposal | undefined {
    return this.queue.find((p) => p.id === id);
  }

  public size(): number {
    return this.queue.length;
  }

  public isEmpty(): boolean {
    return this.queue.length === 0;
  }

  public on<K extends keyof QueueEvents>(
    event: K,
    listener: QueueEvents[K]
  ): this {
    return super.on(event, listener);
  }

  public emit<K extends keyof QueueEvents>(
    event: K,
    ...args: Parameters<QueueEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
