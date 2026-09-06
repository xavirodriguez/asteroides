import { NarrativeEvent } from "./StoryTypes";

/**
 * Causal timeline engine recording narrative lifecycle events and causal dependency graphs.
 *
 * @remarks
 * Implements light narrative event sourcing, allowing developer debugging and player UI inspectability
 * into "why" specific narrative events occurred by traversing causal chains (`causedBy` and `consequences`).
 *
 * @public
 */
export class NarrativeTimelineEngine {
  private events: NarrativeEvent[] = [];
  private eventIndex: Map<string, NarrativeEvent> = new Map();
  private stepCounter = 0;

  /**
   * Records a new narrative event into the causal timeline.
   *
   * @param eventData - Event metadata including type, title, antecedent event IDs, and payload.
   * @returns Recorded narrative event instance.
   */
  public recordEvent(eventData: {
    type: string;
    title: string;
    causedBy?: string[];
    consequences?: string[];
    payload?: Record<string, unknown>;
  }): NarrativeEvent {
    this.stepCounter++;
    const id = `evt_${this.stepCounter}_${Date.now().toString(36)}`;

    const event: NarrativeEvent = {
      id,
      timestamp: Date.now(),
      step: this.stepCounter,
      type: eventData.type,
      title: eventData.title,
      causedBy: eventData.causedBy ? [...eventData.causedBy] : [],
      consequences: eventData.consequences ? [...eventData.consequences] : [],
      payload: eventData.payload ? { ...eventData.payload } : undefined
    };

    this.events.push(event);
    this.eventIndex.set(id, event);

    // Update antecedent consequences lists to maintain bi-directional causal links
    if (event.causedBy) {
      for (const causeId of event.causedBy) {
        const parent = this.eventIndex.get(causeId);
        if (parent) {
          const cons = parent.consequences ? [...parent.consequences] : [];
          if (!cons.includes(id)) {
            cons.push(id);
            (parent as { consequences?: string[] }).consequences = cons;
          }
        }
      }
    }

    return event;
  }

  /**
   * Retrieves all direct antecedent events that caused a target event.
   *
   * @param eventId - Target event string identifier.
   * @returns Array of causal antecedent narrative events.
   */
  public getCausesOf(eventId: string): NarrativeEvent[] {
    const event = this.eventIndex.get(eventId);
    if (!event || !event.causedBy || event.causedBy.length === 0) {
      return [];
    }
    return event.causedBy
      .map((causeId) => this.eventIndex.get(causeId))
      .filter((e): e is NarrativeEvent => e !== undefined);
  }

  /**
   * Retrieves all direct consequence events produced by a target event.
   *
   * @param eventId - Target event string identifier.
   * @returns Array of consequence narrative events.
   */
  public getConsequencesOf(eventId: string): NarrativeEvent[] {
    const event = this.eventIndex.get(eventId);
    if (!event || !event.consequences || event.consequences.length === 0) {
      return [];
    }
    return event.consequences
      .map((consId) => this.eventIndex.get(consId))
      .filter((e): e is NarrativeEvent => e !== undefined);
  }

  /** Retrieves the chronological sequence of all recorded narrative events. */
  public getTimeline(): NarrativeEvent[] {
    return [...this.events];
  }

  /** Generates human-readable debug string representations of the causal timeline. */
  public getFormattedTimeline(): string[] {
    return this.events.map((e) => `[Step ${e.step}] ${e.type}: ${e.title}`);
  }

  /**
   * Truncates timeline events recorded after targetEventId, restoring the event history.
   *
   * @param targetEventId - Target event ID up to which events are retained (or null to reset).
   */
  public truncateAfter(targetEventId: string | null): void {
    if (!targetEventId) {
      this.events = [];
      this.eventIndex.clear();
      this.stepCounter = 0;
      return;
    }

    const targetIndex = this.events.findIndex((e) => e.id === targetEventId);
    if (targetIndex === -1) return;

    const keptEvents = this.events.slice(0, targetIndex + 1);
    this.events = keptEvents;
    this.eventIndex.clear();
    for (const e of keptEvents) {
      this.eventIndex.set(e.id, e);
    }
    this.stepCounter = keptEvents.length > 0 ? keptEvents[keptEvents.length - 1].step : 0;
  }
}
