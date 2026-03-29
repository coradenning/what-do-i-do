const form = document.getElementById("add-activity-form");
const titleInput = document.getElementById("activity-title");
const energyInput = document.getElementById("form-energy");
const budgetInput = document.getElementById("form-budget");
const distanceInput = document.getElementById("form-distance");
const settingInput = document.getElementById("form-setting");
const timeInput = document.getElementById("form-time");
const typeInput = document.getElementById("form-type");
const selectedTypesElement = document.getElementById("form-selected-types");
const savedActivitiesList = document.getElementById("saved-activities-list");
const duplicateCheckBox = document.getElementById("duplicate-check-box");
const duplicateCheckTitle = document.getElementById("duplicate-check-title");
const duplicateCheckMeta = document.getElementById("duplicate-check-meta");
const duplicateConfirmBtn = document.getElementById("duplicate-confirm-btn");
const duplicateDenyBtn = document.getElementById("duplicate-deny-btn");

const statusTitle = document.getElementById("form-status-title");
const statusMeta = document.getElementById("form-status-meta");

const typeSelector = createTypeSelector(typeInput, selectedTypesElement);

[
  [energyInput, "energy"],
  [budgetInput, "budget"],
  [distanceInput, "distance"],
  [settingInput, "setting"],
  [timeInput, "time"],
  [typeInput, "type"]
].forEach(([selectElement, fieldName]) => {
  renderSelectOptions(selectElement, fieldName);
});

let pendingActivity = null;

function resetForm() {
  form.reset();
  typeSelector.reset();
}

function hideDuplicateCheck() {
  duplicateCheckBox.classList.add("hidden");
  document.body.classList.remove("duplicate-check-open");
  pendingActivity = null;
}

function setStatus(title, message) {
  statusTitle.textContent = title;
  statusMeta.textContent = message;
}

function getActivityDraft() {
  const title = normalizeTitle(titleInput.value);

  return {
    id: generateActivityId(title, readCustomActivities().map((activity) => activity.id)),
    title,
    energy: energyInput.value,
    budget: budgetInput.value === "" ? "" : Number(budgetInput.value),
    distance: distanceInput.value,
    setting: settingInput.value,
    time: timeInput.value,
    types: [...typeSelector.getValues()]
  };
}

function getValidationMessage(activity) {
  if (!activity.title) {
    return "add an idea title before publishing";
  }

  const missingDetails = [];

  if (activity.energy && !ENERGY_OPTIONS.includes(activity.energy)) {
    missingDetails.push("energy");
  }

  if (activity.budget !== "" && !BUDGET_OPTIONS.includes(activity.budget)) {
    missingDetails.push("budget");
  }

  if (activity.distance && !DISTANCE_OPTIONS.includes(activity.distance)) {
    missingDetails.push("distance");
  }

  if (activity.setting && !SETTING_OPTIONS.includes(activity.setting)) {
    missingDetails.push("setting");
  }

  if (activity.time && !TIME_OPTIONS.includes(activity.time)) {
    missingDetails.push("time");
  }

  if (!Array.isArray(activity.types) || !activity.types.every((type) => TYPE_OPTIONS.includes(type))) {
    missingDetails.push("types");
  }

  if (missingDetails.length === 0) {
    return "check the activity details and try again";
  }

  return `check the ${missingDetails.join(", ")} selection${missingDetails.length > 1 ? "s" : ""} and try again`;
}

function publishActivity(activity) {
  const customActivities = readCustomActivities();
  writeCustomActivities([
    ...customActivities,
    createActivityRecord(activity, customActivities.map((item) => item.id))
  ]);
  resetForm();
  renderSavedActivities();
  hideDuplicateCheck();

  setStatus(
    "published",
    `"${activity.title}" is saved in this browser and will appear on the main page`
  );
}

function renderSavedActivities() {
  const customActivities = readCustomActivities();

  if (customActivities.length === 0) {
    savedActivitiesList.innerHTML = "<p class=\"empty-state\">no browser-saved ideas yet</p>";
    return;
  }

  savedActivitiesList.innerHTML = "";

  customActivities.forEach((activity) => {
    const item = document.createElement("article");
    item.className = "saved-activity-card";

    const copy = document.createElement("div");
    copy.className = "saved-activity-copy";

    const heading = document.createElement("h3");
    heading.textContent = activity.title;

    const meta = document.createElement("p");
    meta.textContent = formatMeta(activity);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-btn";
    deleteButton.dataset.activityId = activity.id;
    deleteButton.textContent = "delete";

    copy.append(heading, meta);
    item.append(copy, deleteButton);
    savedActivitiesList.appendChild(item);
  });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const newActivity = getActivityDraft();

  if (!isValidActivity(newActivity)) {
    setStatus("missing some details", getValidationMessage(newActivity));
    hideDuplicateCheck();
    return;
  }

  readAllActivities().then((existingActivities) => {
    const duplicateMatch = findPotentialDuplicate(newActivity, existingActivities);

    if (!duplicateMatch) {
      publishActivity(newActivity);
      return;
    }

    pendingActivity = newActivity;
    duplicateCheckTitle.textContent = `possible match: ${duplicateMatch.activity.title}`;
    duplicateCheckMeta.textContent =
      `This looks similar based on title words and tags. Existing item: ${formatMeta(duplicateMatch.activity)}`;
    duplicateCheckBox.classList.remove("hidden");
    document.body.classList.add("duplicate-check-open");

    setStatus(
      "review possible duplicate",
      "choose whether to skip publishing or publish anyway"
    );
  });
});

duplicateConfirmBtn.addEventListener("click", () => {
  if (!pendingActivity) {
    hideDuplicateCheck();
    return;
  }

  setStatus(
    "not published",
    `"${pendingActivity.title}" was treated as a duplicate and not saved`
  );
  hideDuplicateCheck();
});

duplicateDenyBtn.addEventListener("click", () => {
  if (!pendingActivity) {
    hideDuplicateCheck();
    return;
  }

  publishActivity(pendingActivity);
});

savedActivitiesList.addEventListener("click", (event) => {
  const deleteButton = event.target.closest(".delete-btn");

  if (!deleteButton) {
    return;
  }

  const activityId = deleteButton.dataset.activityId;
  const customActivities = readCustomActivities();
  const deletedActivity = customActivities.find((activity) => activity.id === activityId);
  const nextActivities = customActivities.filter((activity) => activity.id !== activityId);

  writeCustomActivities(nextActivities);
  renderSavedActivities();

  if (!deletedActivity) {
    return;
  }

  setStatus("deleted", `"${deletedActivity.title}" was removed from this browser`);
});

renderSavedActivities();
hideDuplicateCheck();
