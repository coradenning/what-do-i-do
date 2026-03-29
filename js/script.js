const RECENT_RESULTS_STORAGE_KEY = "recentActivityResults";
const ACTIVITY_STATS_STORAGE_KEY = "activityShowStats";
const MAX_RECENT_HISTORY = 7;

let activities = [];
let activitiesLoaded = false;
let currentActivity = null;

const energySelect = document.getElementById("energy");
const budgetSelect = document.getElementById("budget");
const distanceSelect = document.getElementById("distance");
const settingSelect = document.getElementById("setting");
const timeSelect = document.getElementById("time");
const typeSelect = document.getElementById("type");
const selectedTypesContainer = document.getElementById("selected-types");

const generateBtn = document.getElementById("generate-btn");
const clearBtn = document.getElementById("clear-btn");
const saveBtn = document.getElementById("save-btn");
const hideBtn = document.getElementById("hide-btn");
const resultActions = document.getElementById("result-actions");
const resultsSection = document.getElementById("results-section");
const resultBox = document.getElementById("result-box");

const resultCount = document.getElementById("result-count");
const resultTitle = document.getElementById("result-title");
const resultMeta = document.getElementById("result-meta");

const typeSelector = createTypeSelector(typeSelect, selectedTypesContainer);

[
  [energySelect, "energy"],
  [budgetSelect, "budget"],
  [distanceSelect, "distance"],
  [settingSelect, "setting"],
  [timeSelect, "time"],
  [typeSelect, "type"]
].forEach(([selectElement, fieldName]) => {
  renderSelectOptions(selectElement, fieldName);
});

function getCurrentFilters() {
  return {
    energy: energySelect.value,
    budget: budgetSelect.value,
    distance: distanceSelect.value,
    setting: settingSelect.value,
    time: timeSelect.value,
    types: typeSelector.getValues()
  };
}

function matchesFilter(activity, filters) {
  const matchesEnergy = !filters.energy || activity.energy === filters.energy;
  const matchesBudget = !filters.budget || activity.budget === Number(filters.budget);
  const matchesDistance = !filters.distance || activity.distance === filters.distance;
  const matchesSetting =
    !filters.setting ||
    activity.setting === filters.setting ||
    activity.setting === "either";
  const matchesTime = !filters.time || activity.time === filters.time;
  const matchesTypes =
    filters.types.length === 0 ||
    filters.types.every((type) => activity.types.includes(type));

  return (
    matchesEnergy &&
    matchesBudget &&
    matchesDistance &&
    matchesSetting &&
    matchesTime &&
    matchesTypes
  );
}

function getFilteredActivities(filters, sourceActivities = activities) {
  return sourceActivities.filter((activity) => matchesFilter(activity, filters));
}

function getRandomItem(items) {
  const randomIndex = Math.floor(Math.random() * items.length);
  return items[randomIndex];
}

function readStoredJson(key, fallbackValue) {
  try {
    const rawValue = window.localStorage.getItem(key);

    if (!rawValue) {
      return fallbackValue;
    }

    const parsedValue = JSON.parse(rawValue);
    return parsedValue ?? fallbackValue;
  } catch (error) {
    console.error(`could not read ${key} from local storage`, error);
    return fallbackValue;
  }
}

function writeStoredJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`could not write ${key} to local storage`, error);
  }
}

function getRecentHistory() {
  const storedHistory = readStoredJson(RECENT_RESULTS_STORAGE_KEY, []);

  if (!Array.isArray(storedHistory)) {
    return [];
  }

  return storedHistory
    .filter((activityId) => typeof activityId === "string" && activityId)
    .slice(0, MAX_RECENT_HISTORY);
}

function saveRecentHistory(history) {
  const safeHistory = Array.isArray(history)
    ? history
      .filter((activityId) => typeof activityId === "string" && activityId)
      .slice(0, MAX_RECENT_HISTORY)
    : [];

  writeStoredJson(RECENT_RESULTS_STORAGE_KEY, safeHistory);
}

function getActivityStats() {
  const storedStats = readStoredJson(ACTIVITY_STATS_STORAGE_KEY, {});

  if (!storedStats || typeof storedStats !== "object" || Array.isArray(storedStats)) {
    return {};
  }

  return Object.entries(storedStats).reduce((safeStats, [activityId, stat]) => {
    if (!stat || typeof stat !== "object" || Array.isArray(stat)) {
      return safeStats;
    }

    safeStats[activityId] = {
      count: Number.isFinite(stat.count) && stat.count > 0 ? stat.count : 0,
      lastShownAt:
        Number.isFinite(stat.lastShownAt) && stat.lastShownAt > 0
          ? stat.lastShownAt
          : 0
    };

    return safeStats;
  }, {});
}

function saveActivityStats(stats) {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) {
    writeStoredJson(ACTIVITY_STATS_STORAGE_KEY, {});
    return;
  }

  writeStoredJson(ACTIVITY_STATS_STORAGE_KEY, stats);
}

function getActivityWeight(activity, recentHistory, stats) {
  const activityStat = stats[activity.id] || { count: 0, lastShownAt: 0 };
  const recentIndex = recentHistory.indexOf(activity.id);
  const hoursSinceShown = activityStat.lastShownAt
    ? (Date.now() - activityStat.lastShownAt) / (1000 * 60 * 60)
    : Infinity;

  let weight = 1;

  // Fresh or rarely shown activities get a lift, while recent or common ones get reduced.
  if (activityStat.count === 0) {
    weight += 2;
  } else {
    weight += Math.min(hoursSinceShown / 24, 2);
    weight -= Math.min(activityStat.count * 0.12, 0.72);
  }

  if (recentIndex === 0) {
    weight *= 0.02;
  } else if (recentIndex > 0) {
    weight *= Math.max(0.18, 0.6 - recentIndex * 0.08);
  }

  return Math.max(weight, 0.05);
}

function chooseWeightedRandomActivity(filteredActivities, weights) {
  if (
    filteredActivities.length === 0 ||
    filteredActivities.length !== weights.length
  ) {
    return null;
  }

  const totalWeight = weights.reduce((sum, weight) => {
    return Number.isFinite(weight) && weight > 0 ? sum + weight : sum;
  }, 0);

  if (totalWeight <= 0) {
    return getRandomItem(filteredActivities);
  }

  let randomThreshold = Math.random() * totalWeight;

  for (let index = 0; index < filteredActivities.length; index += 1) {
    const weight = Number.isFinite(weights[index]) && weights[index] > 0 ? weights[index] : 0;

    randomThreshold -= weight;

    if (randomThreshold <= 0) {
      return filteredActivities[index];
    }
  }

  return filteredActivities[filteredActivities.length - 1];
}

function recordChosenActivity(activityId) {
  const recentHistory = getRecentHistory().filter((id) => id !== activityId);
  const nextHistory = [activityId, ...recentHistory].slice(0, MAX_RECENT_HISTORY);
  const stats = getActivityStats();
  const currentStat = stats[activityId] || { count: 0, lastShownAt: 0 };

  stats[activityId] = {
    count: currentStat.count + 1,
    lastShownAt: Date.now()
  };

  saveRecentHistory(nextHistory);
  saveActivityStats(stats);
}

function chooseActivity(filteredActivities) {
  if (filteredActivities.length === 0) {
    return null;
  }

  if (filteredActivities.length === 1) {
    return filteredActivities[0];
  }

  const recentHistory = getRecentHistory();
  const lastShownId = recentHistory[0];
  const poolWithoutImmediateRepeat = filteredActivities.filter(
    (activity) => activity.id !== lastShownId
  );
  const eligibleActivities =
    poolWithoutImmediateRepeat.length > 0 ? poolWithoutImmediateRepeat : filteredActivities;
  const stats = getActivityStats();
  const weights = eligibleActivities.map((activity) =>
    getActivityWeight(activity, recentHistory, stats)
  );

  return chooseWeightedRandomActivity(eligibleActivities, weights) || getRandomItem(eligibleActivities);
}

function getVisibleFilteredActivities(filters) {
  return getFilteredActivities(filters, getVisibleActivities(activities));
}

function getHiddenFilteredActivities(filters) {
  return getFilteredActivities(filters, getHiddenActivities(activities));
}

function updateResultActions() {
  if (!currentActivity) {
    resultActions.classList.add("hidden");
    saveBtn.textContent = "save idea";
    saveBtn.classList.remove("is-active");
    return;
  }

  resultActions.classList.remove("hidden");
  const saved = isActivitySaved(currentActivity.id);
  saveBtn.textContent = saved ? "saved idea" : "save idea";
  saveBtn.classList.toggle("is-active", saved);
}

function showResultsSection() {
  resultsSection.classList.remove("hidden");
  resultBox.classList.remove("hidden");
}

function hideResultsSection() {
  resultsSection.classList.add("hidden");
  resultBox.classList.add("hidden");
}

function showActivityResult(activity, matchCount) {
  showResultsSection();
  currentActivity = activity;
  recordChosenActivity(activity.id);
  resultCount.textContent = `${matchCount} ${matchCount === 1 ? "match" : "matches"} found`;
  resultTitle.textContent = activity.title;
  resultMeta.textContent = formatMeta(activity);
  updateResultActions();
}

function showEmptyMatchState(hiddenMatchCount) {
  showResultsSection();
  currentActivity = null;
  updateResultActions();

  if (hiddenMatchCount > 0) {
    resultCount.textContent = "0 visible matches";
    resultTitle.textContent = "all matching ideas are hidden";
    resultMeta.textContent = "review hidden ideas on the saved ideas page or clear hidden items there";
    return;
  }

  resultCount.textContent = "0 matches found";
  resultTitle.textContent = "nothing matched";
  resultMeta.textContent = "try clearing one or two filters";
}

function resetFilters() {
  energySelect.value = "";
  budgetSelect.value = "";
  distanceSelect.value = "";
  settingSelect.value = "";
  timeSelect.value = "";
  typeSelector.reset();
}

function showLoadError(hasCustomActivities) {
  showResultsSection();
  resultCount.textContent = "";
  currentActivity = null;
  updateResultActions();

  if (hasCustomActivities) {
    resultTitle.textContent = "loaded your saved ideas";
    resultMeta.textContent =
      "activities.json could not load, but browser-saved ideas are still available";
    return;
  }

  resultTitle.textContent = "couldn’t load activities";
  resultMeta.textContent = "check your file paths and json formatting";
}

function runGenerator() {
  if (!activitiesLoaded) {
    resultCount.textContent = "";
    currentActivity = null;
    updateResultActions();
    resultTitle.textContent = "still loading...";
    resultMeta.textContent = "";
    return;
  }

  if (activities.length === 0) {
    showLoadError(false);
    return;
  }

  const filters = getCurrentFilters();
  const visibleMatches = getVisibleFilteredActivities(filters);

  if (visibleMatches.length === 0) {
    showEmptyMatchState(getHiddenFilteredActivities(filters).length);
    return;
  }

  const chosenActivity = chooseActivity(visibleMatches);
  showActivityResult(chosenActivity, visibleMatches.length);
}

readAllActivities()
  .then((loadedActivities) => {
    activities = loadedActivities;
    activitiesLoaded = true;
    updateResultActions();

    if (didSeedActivitiesFailToLoad()) {
      showLoadError(activities.length > 0);
    }
  })
  .catch((error) => {
    console.error("error loading activities:", error);
    activities = readCustomActivities();
    activitiesLoaded = true;
    updateResultActions();
    showLoadError(activities.length > 0);
  });

generateBtn.addEventListener("click", () => {
  runGenerator();
});

saveBtn.addEventListener("click", () => {
  if (!currentActivity) {
    return;
  }

  toggleSavedActivity(currentActivity.id);
  updateResultActions();
});

hideBtn.addEventListener("click", () => {
  if (!currentActivity) {
    return;
  }

  hideActivity(currentActivity.id);
  runGenerator();
});

clearBtn.addEventListener("click", () => {
  resetFilters();
  hideResultsSection();
  resultCount.textContent = "";
  currentActivity = null;
  updateResultActions();
  resultTitle.textContent = "your idea will appear here";
  resultMeta.textContent = "";
});

updateResultActions();
hideResultsSection();
