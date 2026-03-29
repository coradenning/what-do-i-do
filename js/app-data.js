const CUSTOM_ACTIVITY_STORAGE_KEY = "customActivities";
const LEGACY_CUSTOM_ACTIVITY_STORAGE_KEY = "customActivites";
const SAVED_ACTIVITY_IDS_STORAGE_KEY = "savedActivityIds";
const HIDDEN_ACTIVITY_IDS_STORAGE_KEY = "hiddenActivityIds";

const ENERGY_OPTIONS = Object.freeze(["low", "high"]);
const BUDGET_OPTIONS = Object.freeze([1, 2, 3]);
const DISTANCE_OPTIONS = Object.freeze(["home", "short", "long"]);
const SETTING_OPTIONS = Object.freeze(["indoor", "outdoor", "either"]);
const TIME_OPTIONS = Object.freeze(["short", "medium", "long"]);
const TYPE_OPTIONS = Object.freeze([
  "creative",
  "practical",
  "restful",
  "adventurous",
  "romantic",
  "errands",
  "learning",
  "nature",
  "project",
  "fun"
]);

const OPTION_LABELS = Object.freeze({
  budget: Object.freeze({
    1: "free",
    2: "low cost",
    3: "treat yourself"
  }),
  distance: Object.freeze({
    home: "home / no travel",
    short: "short drive or walk",
    long: "long drive"
  }),
  time: Object.freeze({
    short: "short (15-30 min)",
    medium: "medium (1-2 hr)",
    long: "long (half day)"
  })
});

const FIELD_CONFIG = Object.freeze({
  energy: Object.freeze({
    options: ENERGY_OPTIONS,
    getLabel: (value) => value
  }),
  budget: Object.freeze({
    options: BUDGET_OPTIONS,
    getLabel: (value) => OPTION_LABELS.budget[value] || ""
  }),
  distance: Object.freeze({
    options: DISTANCE_OPTIONS,
    getLabel: (value) => OPTION_LABELS.distance[value] || value
  }),
  setting: Object.freeze({
    options: SETTING_OPTIONS,
    getLabel: (value) => value
  }),
  time: Object.freeze({
    options: TIME_OPTIONS,
    getLabel: (value) => OPTION_LABELS.time[value] || value
  }),
  type: Object.freeze({
    options: TYPE_OPTIONS,
    getLabel: (value) => value
  })
});

const DUPLICATE_SCORING = Object.freeze({
  titleWeight: 0.75,
  typeWeight: 0.25,
  matchingTimeBonus: 0.08,
  matchingDistanceBonus: 0.07,
  threshold: 0.78
});

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "for",
  "go",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
  "your"
]);

let seedActivitiesPromise;
let seedActivitiesLoadFailed = false;

function readStoredJsonValue(storageKey, fallbackValue) {
  try {
    const rawValue = window.localStorage.getItem(storageKey);

    if (!rawValue) {
      return fallbackValue;
    }

    const parsedValue = JSON.parse(rawValue);
    return parsedValue ?? fallbackValue;
  } catch (error) {
    console.error(`could not read ${storageKey} from local storage`, error);
    return fallbackValue;
  }
}

function writeStoredJsonValue(storageKey, value) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch (error) {
    console.error(`could not write ${storageKey} to local storage`, error);
  }
}

function sanitizeActivityIdList(ids) {
  if (!Array.isArray(ids)) {
    return [];
  }

  const seenIds = new Set();

  return ids.reduce((safeIds, id) => {
    const normalizedId = normalizeWhitespace(id);

    if (!normalizedId || seenIds.has(normalizedId)) {
      return safeIds;
    }

    seenIds.add(normalizedId);
    safeIds.push(normalizedId);
    return safeIds;
  }, []);
}

function getSavedActivityIds() {
  return sanitizeActivityIdList(
    readStoredJsonValue(SAVED_ACTIVITY_IDS_STORAGE_KEY, [])
  );
}

function saveSavedActivityIds(ids) {
  writeStoredJsonValue(
    SAVED_ACTIVITY_IDS_STORAGE_KEY,
    sanitizeActivityIdList(ids)
  );
}

function getHiddenActivityIds() {
  return sanitizeActivityIdList(
    readStoredJsonValue(HIDDEN_ACTIVITY_IDS_STORAGE_KEY, [])
  );
}

function saveHiddenActivityIds(ids) {
  writeStoredJsonValue(
    HIDDEN_ACTIVITY_IDS_STORAGE_KEY,
    sanitizeActivityIdList(ids)
  );
}

function isActivitySaved(id) {
  return getSavedActivityIds().includes(id);
}

function isActivityHidden(id) {
  return getHiddenActivityIds().includes(id);
}

function toggleSavedActivity(id) {
  const savedIds = getSavedActivityIds();
  const nextSavedIds = savedIds.includes(id)
    ? savedIds.filter((savedId) => savedId !== id)
    : [...savedIds, id];

  saveSavedActivityIds(nextSavedIds);
  return nextSavedIds.includes(id);
}

function hideActivity(id) {
  const hiddenIds = getHiddenActivityIds();

  if (hiddenIds.includes(id)) {
    return hiddenIds;
  }

  const nextHiddenIds = [...hiddenIds, id];
  saveHiddenActivityIds(nextHiddenIds);
  return nextHiddenIds;
}

function unhideActivity(id) {
  const nextHiddenIds = getHiddenActivityIds().filter(
    (hiddenId) => hiddenId !== id
  );
  saveHiddenActivityIds(nextHiddenIds);
  return nextHiddenIds;
}

function getVisibleActivities(allActivities) {
  const hiddenIds = new Set(getHiddenActivityIds());
  return allActivities.filter((activity) => !hiddenIds.has(activity.id));
}

function getSavedActivities(allActivities) {
  const savedIds = new Set(getSavedActivityIds());
  return allActivities.filter((activity) => savedIds.has(activity.id));
}

function getHiddenActivities(allActivities) {
  const hiddenIds = new Set(getHiddenActivityIds());
  return allActivities.filter((activity) => hiddenIds.has(activity.id));
}

function getAllowedValues(fieldName) {
  return FIELD_CONFIG[fieldName]?.options || [];
}

function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComparisonText(value) {
  return normalizeWhitespace(value)
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]+/gu, " ")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTitle(value) {
  return normalizeWhitespace(value);
}

function slugifyValue(value) {
  const slug = normalizeComparisonText(value)
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "activity";
}

function generateActivityId(title, existingIds = []) {
  const baseId = slugifyValue(title);
  const reservedIds = new Set(existingIds.filter(Boolean));

  if (!reservedIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;

  while (reservedIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseId}-${suffix}`;
}

function normalizeEnumValue(value, fieldName) {
  if (value === "" || value == null) {
    return "";
  }

  const allowedValues = getAllowedValues(fieldName);
  let normalizedValue = typeof value === "number" ? value : normalizeWhitespace(value);

  if (fieldName === "distance" && normalizedValue === "none") {
    normalizedValue = "home";
  }

  return allowedValues.includes(normalizedValue) ? normalizedValue : "";
}

function normalizeBudgetValue(value) {
  if (value === "" || value == null) {
    return "";
  }

  const normalizedValue = Number(value);
  return BUDGET_OPTIONS.includes(normalizedValue) ? normalizedValue : "";
}

function normalizeTypes(types) {
  if (!Array.isArray(types)) {
    return [];
  }

  const seenTypes = new Set();

  return types.reduce((normalizedTypes, typeValue) => {
    const normalizedType = normalizeEnumValue(typeValue, "type");

    if (!normalizedType || seenTypes.has(normalizedType)) {
      return normalizedTypes;
    }

    seenTypes.add(normalizedType);
    normalizedTypes.push(normalizedType);
    return normalizedTypes;
  }, []);
}

function createActivityRecord(activity, existingIds = []) {
  const title = normalizeTitle(activity?.title);
  const requestedId = normalizeWhitespace(activity?.id);
  const id = requestedId || generateActivityId(title, existingIds);

  return {
    id,
    title,
    energy: normalizeEnumValue(activity?.energy, "energy"),
    budget: normalizeBudgetValue(activity?.budget),
    distance: normalizeEnumValue(activity?.distance, "distance"),
    setting: normalizeEnumValue(activity?.setting, "setting"),
    time: normalizeEnumValue(activity?.time, "time"),
    types: normalizeTypes(activity?.types)
  };
}

function hasAllowedOptionalValue(value, fieldName) {
  return value === "" || getAllowedValues(fieldName).includes(value);
}

function isValidActivity(activity) {
  if (!activity || typeof activity !== "object") {
    return false;
  }

  if (typeof activity.id !== "string" || normalizeWhitespace(activity.id) === "") {
    return false;
  }

  if (typeof activity.title !== "string" || normalizeTitle(activity.title) === "") {
    return false;
  }

  if (
    !hasAllowedOptionalValue(activity.energy, "energy") ||
    !hasAllowedOptionalValue(activity.distance, "distance") ||
    !hasAllowedOptionalValue(activity.setting, "setting") ||
    !hasAllowedOptionalValue(activity.time, "time")
  ) {
    return false;
  }

  if (activity.budget !== "" && !BUDGET_OPTIONS.includes(activity.budget)) {
    return false;
  }

  if (!Array.isArray(activity.types)) {
    return false;
  }

  return activity.types.every((typeValue) => TYPE_OPTIONS.includes(typeValue));
}

function sanitizeActivityList(activities) {
  if (!Array.isArray(activities)) {
    return [];
  }

  const usedIds = new Set();
  const sanitizedActivities = [];

  activities.forEach((activity) => {
    const normalizedActivity = createActivityRecord(activity, Array.from(usedIds));

    if (!isValidActivity(normalizedActivity)) {
      return;
    }

    if (usedIds.has(normalizedActivity.id)) {
      normalizedActivity.id = generateActivityId(normalizedActivity.title, Array.from(usedIds));
    }

    usedIds.add(normalizedActivity.id);
    sanitizedActivities.push(normalizedActivity);
  });

  return sanitizedActivities;
}

function readStoredActivityList(storageKey) {
  try {
    const rawValue = window.localStorage.getItem(storageKey);

    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch (error) {
    console.error(`could not read ${storageKey} from local storage`, error);
    return [];
  }
}

function persistMigratedCustomActivities(activities) {
  try {
    window.localStorage.setItem(
      CUSTOM_ACTIVITY_STORAGE_KEY,
      JSON.stringify(activities)
    );
    window.localStorage.removeItem(LEGACY_CUSTOM_ACTIVITY_STORAGE_KEY);
  } catch (error) {
    console.error("could not migrate custom activities", error);
  }
}

function readCustomActivities() {
  const primaryActivities = readStoredActivityList(CUSTOM_ACTIVITY_STORAGE_KEY);
  const legacyActivities = readStoredActivityList(LEGACY_CUSTOM_ACTIVITY_STORAGE_KEY);
  const sanitizedActivities = sanitizeActivityList([
    ...primaryActivities,
    ...legacyActivities
  ]);

  const primarySerialized = JSON.stringify(sanitizeActivityList(primaryActivities));
  const legacyExists = window.localStorage.getItem(LEGACY_CUSTOM_ACTIVITY_STORAGE_KEY) !== null;
  const sanitizedSerialized = JSON.stringify(sanitizedActivities);

  if (legacyExists || primarySerialized !== sanitizedSerialized) {
    persistMigratedCustomActivities(sanitizedActivities);
  }

  return sanitizedActivities;
}

function writeCustomActivities(activities) {
  const safeActivities = sanitizeActivityList(activities);

  try {
    window.localStorage.setItem(
      CUSTOM_ACTIVITY_STORAGE_KEY,
      JSON.stringify(safeActivities)
    );
    window.localStorage.removeItem(LEGACY_CUSTOM_ACTIVITY_STORAGE_KEY);
  } catch (error) {
    console.error("could not write custom activities", error);
  }
}

function readSeedActivities() {
  if (!seedActivitiesPromise) {
    seedActivitiesPromise = fetch("./data/activities.json")
      .then((response) => {
        if (!response.ok) {
          throw new Error("could not load activities.json");
        }

        return response.json();
      })
      .then((activities) => {
        seedActivitiesLoadFailed = false;
        return sanitizeActivityList(activities);
      })
      .catch((error) => {
        seedActivitiesLoadFailed = true;
        console.error("could not load seed activities", error);
        return [];
      });
  }

  return seedActivitiesPromise;
}

function readAllActivities() {
  return readSeedActivities().then((seedActivities) => [
    ...seedActivities,
    ...readCustomActivities()
  ]);
}

function didSeedActivitiesFailToLoad() {
  return seedActivitiesLoadFailed;
}

function formatBudget(budget) {
  return OPTION_LABELS.budget[budget] || "";
}

function formatMeta(activity) {
  return [
    `energy: ${activity.energy || "any"}`,
    `budget: ${formatBudget(activity.budget) || "any"}`,
    `distance: ${FIELD_CONFIG.distance.getLabel(activity.distance) || "any"}`,
    `setting: ${activity.setting || "any"}`,
    `time: ${FIELD_CONFIG.time.getLabel(activity.time) || "any"}`,
    `type: ${activity.types.length > 0 ? activity.types.join(", ") : "any"}`
  ].join(" • ");
}

function getMeaningfulWords(value) {
  return normalizeComparisonText(value)
    .split(" ")
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function getOverlapRatio(firstValues, secondValues) {
  if (firstValues.length === 0 || secondValues.length === 0) {
    return 0;
  }

  const firstSet = new Set(firstValues);
  const secondSet = new Set(secondValues);
  let overlapCount = 0;

  firstSet.forEach((value) => {
    if (secondSet.has(value)) {
      overlapCount += 1;
    }
  });

  return overlapCount / Math.max(firstSet.size, secondSet.size);
}

function getDuplicateMatchScore(firstActivity, secondActivity) {
  const firstTitle = normalizeComparisonText(firstActivity.title);
  const secondTitle = normalizeComparisonText(secondActivity.title);

  if (firstTitle && firstTitle === secondTitle) {
    return 1;
  }

  const titleOverlap = getOverlapRatio(
    getMeaningfulWords(firstActivity.title),
    getMeaningfulWords(secondActivity.title)
  );
  const typeOverlap = getOverlapRatio(firstActivity.types, secondActivity.types);

  let score =
    titleOverlap * DUPLICATE_SCORING.titleWeight +
    typeOverlap * DUPLICATE_SCORING.typeWeight;

  if (
    firstActivity.time &&
    secondActivity.time &&
    firstActivity.time === secondActivity.time
  ) {
    score += DUPLICATE_SCORING.matchingTimeBonus;
  }

  if (
    firstActivity.distance &&
    secondActivity.distance &&
    firstActivity.distance === secondActivity.distance
  ) {
    score += DUPLICATE_SCORING.matchingDistanceBonus;
  }

  return Math.min(score, 1);
}

function findPotentialDuplicate(activity, existingActivities) {
  let bestMatch = null;

  existingActivities.forEach((existingActivity) => {
    if (existingActivity.id === activity.id) {
      return;
    }

    const score = getDuplicateMatchScore(activity, existingActivity);

    if (score < DUPLICATE_SCORING.threshold) {
      return;
    }

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = {
        activity: existingActivity,
        score
      };
    }
  });

  return bestMatch;
}

function renderSelectOptions(selectElement, fieldName) {
  const fieldConfig = FIELD_CONFIG[fieldName];

  if (!selectElement || !fieldConfig) {
    return;
  }

  const currentValue = selectElement.value;
  selectElement.innerHTML = "";

  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "";
  selectElement.appendChild(emptyOption);

  fieldConfig.options.forEach((optionValue) => {
    const option = document.createElement("option");
    option.value = String(optionValue);
    option.textContent = fieldConfig.getLabel(optionValue);
    selectElement.appendChild(option);
  });

  if ([...selectElement.options].some((option) => option.value === currentValue)) {
    selectElement.value = currentValue;
  }
}

function createTypeSelector(selectElement, selectedTypesContainer) {
  let selectedTypes = [];

  function render() {
    selectedTypesContainer.innerHTML = "";

    selectedTypes.forEach((type) => {
      const tag = document.createElement("button");
      tag.type = "button";
      tag.className = "selected-tag";
      tag.dataset.type = type;
      tag.innerHTML = `${type} <span aria-hidden="true">x</span>`;
      selectedTypesContainer.appendChild(tag);
    });

    Array.from(selectElement.options).forEach((option) => {
      if (!option.value) {
        return;
      }

      option.disabled = selectedTypes.includes(option.value);
    });
  }

  selectElement.addEventListener("change", () => {
    const selectedType = normalizeEnumValue(selectElement.value, "type");

    if (selectedType && !selectedTypes.includes(selectedType)) {
      selectedTypes = [...selectedTypes, selectedType];
      render();
    }

    selectElement.value = "";
  });

  selectedTypesContainer.addEventListener("click", (event) => {
    const tagButton = event.target.closest(".selected-tag");

    if (!tagButton) {
      return;
    }

    selectedTypes = selectedTypes.filter((type) => type !== tagButton.dataset.type);
    render();
  });

  render();

  return {
    getValues() {
      return [...selectedTypes];
    },
    reset() {
      selectedTypes = [];
      selectElement.value = "";
      render();
    },
    setValues(values) {
      selectedTypes = normalizeTypes(values);
      selectElement.value = "";
      render();
    }
  };
}
