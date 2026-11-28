import { heckmanExample } from "./causal-heckman-data.js";
import { $, axis, blue, chart, decimal, gold, mint, muted, percent, series, table } from "./experiment-tools.js";

const { customers, true: truth, ols, withReminder, withoutReminder, linkedExamples, grid } = heckmanExample;
const money = value => `${value < 0 ? "−" : ""}$${decimal(Math.abs(value))}`;
const selectionTerms = ["Intercept (γ<sub>0</sub>)", "Tenure (γ<sub>1</sub>)", "Reminder (γ<sub>2</sub>)"];
const outcomeTerms = ["Intercept (β<sub>0</sub>)", "Tenure (β<sub>1</sub>)", "Inverse Mills ratio (β<sub>λ</sub>)"];

$("#heckman-selection-fit").innerHTML = table(["Probit term", "True value", "Estimate", "Standard error"],
  selectionTerms.map((term, i) => [term, decimal(truth.selection[i], 4),
    decimal(withReminder.selection[i], 4), decimal(withReminder.selectionSe[i], 4)]),
  "Linking model fitted on all customers", { layout: "stack" });

$("#heckman-mills-examples").innerHTML = table(["Linking probability rank", "Customer", "Fitted index", "Linking probability", "Inverse Mills ratio"],
  linkedExamples.map(([customer, index, probability, mills], i) =>
    [["Lowest", "Middle", "Highest"][i], customer, decimal(index, 3), percent(probability), decimal(mills, 3)]),
  "Three customers who linked receipts", { layout: "stack" });

$("#heckman-outcome-fit").innerHTML = table(["Spending term", "Estimate ($)", "Naive OLS SE ($)", "Two-step SE ($)"],
  outcomeTerms.map((term, i) => [term, ...[withReminder.coefficients, withReminder.naiveSe, withReminder.twoStepSe]
    .map(values => decimal(values[i], i === 1 ? 3 : 2))]),
  "Spending model fitted on linked customers", { layout: "stack" });

const spendingFits = [
  ["True parameters", truth],
  ["OLS on linked customers", ols, ols.se],
  ["Heckman with reminder", withReminder, withReminder.twoStepSe],
  ["Heckman without reminder", withoutReminder, withoutReminder.twoStepSe],
];
$("#heckman-spending-fits").innerHTML = table(
  ["Model", "Intercept ($)", "Tenure ($/month)", "λ coefficient ($)", "Correlation of tenure and λ̂", "Average predicted spending ($)"],
  spendingFits.map(([label, fit, errors]) => [label,
    ...outcomeTerms.map((_, i) => {
      const coefficient = fit.coefficients[i];
      if (coefficient === undefined) return "—";
      const estimate = decimal(coefficient, i === 1 ? 3 : 2);
      return errors ? `${estimate}<br>(${decimal(errors[i], i === 1 ? 3 : 2)})` : estimate;
    }),
    fit.tenureMillsCorrelation === undefined ? "—" : decimal(fit.tenureMillsCorrelation, 3),
    decimal(fit.averageSpending),
  ]), "Spending estimates with standard errors in parentheses", { layout: "stack" });

const spendingLines = [
  ["Known spending relationship", muted],
  ["OLS on linked customers", gold],
  ["Heckman-corrected regression", mint],
  ["Expected spending among linked customers", blue, [6, 4]],
];
const customerSpending = customers.map(row => row[3]);
const customerPoints = linked => customers.filter(row => row[2] === linked)
  .map(([tenure, , , spending]) => ({ x: tenure, y: spending })).sort((a, b) => a.x - b.x);
chart($("#heckman-spending-chart"), {
  legend: true,
  datasets: [
    ...spendingLines.map(([label, color, borderDash], i) => series(label,
      grid.map(row => ({ x: row[0], y: row[i + 1] })), color,
      { borderDash, borderWidth: i < 2 ? 3 : 2, order: i < 2 ? 1 : 0 })),
    series("Linked customers", customerPoints(true), "rgba(78, 91, 131, 0.40)",
      { showLine: false, pointRadius: 2, borderWidth: 0, order: 2 }),
    series("Unlinked customers (visible only in simulation)", customerPoints(false), "#d1d5db",
      { showLine: false, pointRadius: 2, borderWidth: 0, order: 3 }),
  ],
  x: { title: axis("Tenure (months)") },
  y: { title: axis("Monthly spending ($)"), min: 25 * Math.floor(Math.min(...customerSpending) / 25),
    max: 25 * Math.ceil(Math.max(...customerSpending) / 25), ticks: { color: muted, stepSize: 50, includeBounds: false } },
});

$("#heckman-plotted-fits").innerHTML = table(["Tenure (months)", ...spendingLines.map(([label]) => label)],
  grid.map(([tenure, ...values]) => [tenure, ...values.map(money)]), "Monthly spending at each plotted tenure", { layout: "stack" });

const customerDetails = $("#heckman-plotted-customers");
customerDetails.addEventListener("toggle", () => {
  $("#heckman-customer-points").innerHTML = table(["ID", "Tenure (mo.)", "Linked", "Spend ($)"],
    customers.map(([tenure, , linked, spending], i) => [i + 1, decimal(tenure, 1), linked ? "Yes" : "No", decimal(spending)]),
    "Unlinked customers’ spending is visible only in the simulation");
}, { once: true });
