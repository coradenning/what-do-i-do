const savedIdeasList = document.getElementById("saved-ideas-list");
const hiddenIdeasList = document.getElementById("hidden-ideas-list");
const clearHiddenBtn = document.getElementById("clear-hidden-btn");

function createActivityCard(activity, actionLabel, actionClassName, actionHandler) {
  const item = document.createElement("article");
  item.className = "saved-activity-card";

  const copy = document.createElement("div");
  copy.className = "saved-activity-copy";

  const heading = document.createElement("h3");
  heading.textContent = activity.title;

  const meta = document.createElement("p");
  meta.textContent = formatMeta(activity);

  const actionButton = document.createElement("button");
  actionButton.type = "button";
  actionButton.className = actionClassName;
  actionButton.dataset.activityId = activity.id;
  actionButton.textContent = actionLabel;
  actionButton.addEventListener("click", () => {
    actionHandler(activity.id);
    renderLists();
  });

  copy.append(heading, meta);
  item.append(copy, actionButton);
  return item;
}

function renderActivityList(container, activities, emptyMessage, actionLabel, actionClassName, actionHandler) {
  if (activities.length === 0) {
    container.innerHTML = `<p class="empty-state">${emptyMessage}</p>`;
    return;
  }

  container.innerHTML = "";
  activities.forEach((activity) => {
    container.appendChild(
      createActivityCard(activity, actionLabel, actionClassName, actionHandler)
    );
  });
}

function renderLists() {
  readAllActivities()
    .then((allActivities) => {
      const savedActivities = getSavedActivities(allActivities);
      const hiddenActivities = getHiddenActivities(allActivities);

      renderActivityList(
        savedIdeasList,
        savedActivities,
        "no saved ideas yet",
        "remove",
        "secondary-btn",
        (activityId) => {
          if (isActivitySaved(activityId)) {
            toggleSavedActivity(activityId);
          }
        }
      );

      renderActivityList(
        hiddenIdeasList,
        hiddenActivities,
        "no hidden ideas",
        "unhide",
        "secondary-btn",
        (activityId) => {
          unhideActivity(activityId);
        }
      );

      clearHiddenBtn.disabled = hiddenActivities.length === 0;
    })
    .catch((error) => {
      console.error("could not load activities for saved page", error);
      savedIdeasList.innerHTML = "<p class=\"empty-state\">could not load saved ideas</p>";
      hiddenIdeasList.innerHTML = "<p class=\"empty-state\">could not load hidden ideas</p>";
      clearHiddenBtn.disabled = true;
    });
}

clearHiddenBtn.addEventListener("click", () => {
  saveHiddenActivityIds([]);
  renderLists();
});

renderLists();
