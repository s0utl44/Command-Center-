import { parseProcessDefinition, type ProcessDefinition } from "../process";
import { wrePhotoEditV1 } from "./wre-photo-edit";

/** Procesy wgrywane do pustej bazy jako wersja 1. Później zmieniane wyłącznie przez nowe wersje. */
export const SEED_PROCESSES: readonly ProcessDefinition[] = [parseProcessDefinition(wrePhotoEditV1)];
