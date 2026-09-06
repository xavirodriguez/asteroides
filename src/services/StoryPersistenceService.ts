import { StoryState, StoryRuntime } from "@tiny-aster/core";
import { PlayerProfileService } from "./PlayerProfileService";

/**
 * Service to sync Data-Driven Story state with PlayerProfileService persistence.
 * @public
 */
export class StoryPersistenceService {
  /**
   * Saves active story runtime state into PlayerProfileService.
   */
  public static async saveStoryState(storyState: StoryState): Promise<void> {
    const profile = await PlayerProfileService.getProfile();

    // Save unlocked chapter if updated
    if (storyState.variables["chapterUnlocked"]) {
      const ch = Number(storyState.variables["chapterUnlocked"]);
      if (!isNaN(ch) && ch > profile.storyChapterUnlocked) {
        profile.storyChapterUnlocked = ch;
      }
    }

    // Save collected fragments
    if (Array.isArray(storyState.variables["collectedFragments"])) {
      const frags = storyState.variables["collectedFragments"] as string[];
      for (const frag of frags) {
        if (!profile.storyFragmentsCollected.includes(frag)) {
          profile.storyFragmentsCollected.push(frag);
        }
      }
    }

    await PlayerProfileService.saveProfile();
  }

  /**
   * Loads story state metadata from PlayerProfileService and applies it to runtime.
   */
  public static async loadStoryState(runtime: StoryRuntime): Promise<void> {
    const profile = await PlayerProfileService.getProfile();

    runtime.setVariable("chapterUnlocked", profile.storyChapterUnlocked);
    runtime.setVariable("collectedFragments", profile.storyFragmentsCollected.length);

    for (const fragId of profile.storyFragmentsCollected) {
      runtime.setFlag(`fragment_collected:${fragId}`, true);
    }
  }
}
