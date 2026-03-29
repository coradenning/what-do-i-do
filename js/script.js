let activities = [];
let activitiesLoaded = false;

const energySelect = document.getElementById("energy");
const budgetSelect = document.getElementById("budget");
const distanceSelect = document.getElementById("distance");
const settingSelect = document.getElementById("setting");
const timeSelect = document.getElementById("time");
const typeSelect = document.getElementById("type");
const selectedTypesContainer = document.getElementById("selected-types");

const generateBtn = document.getElementById("generate-btn");
const clearBtn = document.getElementById("clear-btn");

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

function getRandomItem(items) {
  const randomIndex = Math.floor(Math.random() * items.length);
  return items[randomIndex];
}

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

function resetFilters() {
  energySelect.value = "";
  budgetSelect.value = "";
  distanceSelect.value = "";
  settingSelect.value = "";
  timeSelect.value = "";
  typeSelector.reset();
}

function showLoadError(hasCustomActivities) {
  if (hasCustomActivities) {
    resultTitle.textContent = "loaded your saved ideas";
    resultMeta.textContent =
      "activities.json could not load, but browser-saved ideas are still available";
    return;
  }

  resultTitle.textContent = "couldn’t load activities";
  resultMeta.textContent = "check your file paths and json formatting";
}

readAllActivities()
  .then((loadedActivities) => {
    activities = loadedActivities;
    activitiesLoaded = true;

    if (didSeedActivitiesFailToLoad()) {
      showLoadError(activities.length > 0);
    }
  })
  .catch((error) => {
    console.error("error loading activities:", error);
    activities = readCustomActivities();
    activitiesLoaded = true;
    showLoadError(activities.length > 0);
  });

generateBtn.addEventListener("click", () => {
  if (!activitiesLoaded) {
    resultTitle.textContent = "still loading...";
    resultMeta.textContent = "";
    return;
  }

  if (activities.length === 0) {
    showLoadError(false);
    return;
  }

  const filteredActivities = activities.filter((activity) =>
    matchesFilter(activity, getCurrentFilters())
  );

  if (filteredActivities.length === 0) {
    resultTitle.textContent = "nothing matched";
    resultMeta.textContent = "try clearing one or two filters";
    return;
  }

  const chosenActivity = getRandomItem(filteredActivities);
  resultTitle.textContent = chosenActivity.title;
  resultMeta.textContent = formatMeta(chosenActivity);
});

clearBtn.addEventListener("click", () => {
  resetFilters();
  resultTitle.textContent = "your idea will appear here";
  resultMeta.textContent = "";
});
