import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import App from "./App";

const openSample = async () => {
  const screen = await render(<App />);
  await expect.element(screen.getByRole("heading", { name: "Open a family archive" })).toBeVisible();
  await screen.getByRole("button", { name: "Open sample tree" }).click();
  await expect.element(screen.getByText("18.750%")).toBeVisible();
  return screen;
};

test("starts empty and loads the sample tree on demand", async () => {
  const screen = await openSample();

  await expect.element(screen.getByText("Kinship φ = 9.375%")).toBeVisible();
  await expect.element(screen.getByText("10 people")).toBeVisible();
  await expect.element(screen.getByText("Great-aunt and great-niece")).toBeVisible();
  await expect.element(screen.getByText("First cousins once removed")).toBeVisible();
});

test("navigates between all sidebar sections", async () => {
  const screen = await openSample();

  await screen.getByRole("button", { name: "Compare people" }).click();
  await expect.element(screen.getByRole("heading", { name: "Compare people" })).toBeVisible();

  await screen.getByRole("button", { name: "Relationship matrix" }).click();
  await expect.element(screen.getByRole("heading", { name: "Comparison matrix" })).toBeVisible();

  await screen.getByRole("button", { name: "Reports" }).click();
  await expect.element(screen.getByRole("heading", { name: "Inbreeding report" })).toBeVisible();

  await screen.getByRole("button", { name: "Family tree" }).click();
  await expect.element(screen.getByRole("heading", { name: "Family tree" })).toBeVisible();
});

test("searches for a person and updates the result", async () => {
  const screen = await openSample();
  const picker = screen.getByRole("combobox", { name: "Person two" });
  await picker.fill("Benjamin");
  await screen.getByRole("option", { name: /Benjamin B\./ }).click();
  await expect.element(screen.getByText("53.125%").first()).toBeVisible();
});

test("does not offer the same person in both comparison pickers", async () => {
  const screen = await openSample();
  const picker = screen.getByRole("combobox", { name: "Person two" });
  await picker.fill("Alice A.");
  await expect.element(screen.getByText("No matching people")).toBeVisible();
});

test("focuses the matrix on the comparison and can load more people", async () => {
  const screen = await openSample();
  await screen.getByRole("button", { name: "Relationship matrix" }).click();
  await expect.element(screen.getByText(/Showing 8 of 17 people/)).toBeVisible();
  await screen.getByRole("button", { name: "Show 12 more" }).click();
  await expect.element(screen.getByText(/Showing 17 of 17 people/)).toBeVisible();
  await expect.element(screen.getByText("Rii 1.0313")).toBeVisible();
});

test("zooms the sample pedigree", async () => {
  const screen = await openSample();
  await screen.getByRole("button", { name: "Zoom in" }).click();
  await expect.element(screen.getByText("115%")).toBeVisible();
});
