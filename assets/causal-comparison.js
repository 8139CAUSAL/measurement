import { $, all } from "./experiment-tools.js";

const form = $("#causal-chooser-form");
const result = $("#causal-chooser-result");
const didLesson = $("#common-adoption a").getAttribute("href");
const rdLesson = $("#cutoff-designs a").getAttribute("href");

const prePost = "Comparable baseline and follow-up populations, no anticipation, and parallel untreated changes on the outcome scale.";
const gaps = {
  observations: ["Provisional design", "Confirm which group-date outcomes exist. A before-and-after comparison needs an earlier observation for both the treated group and its candidate controls.", "#common-adoption"],
  timing: ["Provisional DiD design", "Confirm first treatment dates, dose, and whether treatment stays on. Comparison eligibility depends on the full path through follow-up.", "#staggered-adoption"],
  pool: ["Provisional comparison", "Identify who remains untreated and unexposed through follow-up and confirm their baseline and follow-up outcomes.", "#staggered-adoption"],
  none: ["Comparison missing", "This DiD contrast needs an unaffected group with observations over the same dates. Confirm an unexposed cohort, a supported donor history, or an eligibility subgroup design.", "#eligibility-and-exposure"],
  exposure: ["Provisional exposure design", "Map who is exposed and when. A control group should remain outside the relevant exposure, or supply a supported contrast at the same exposure level.", "#spillover-did"],
  separate: ["Separate effects lack support", "Compare own treatment at a fixed level of neighbor exposure and compare neighbor exposure at a fixed own treatment. With only joint variation, consider a supported joint-exposure contrast.", "#spillover-did"],
  cutoff: ["Provisional cutoff design", "Confirm the written rule, the running score, observations close to both sides, and whether eligibility changes receipt.", "#cutoff-designs"],
  later: ["Restrict the horizon", "Identify an earlier baseline and follow-up while the later cohort is still untreated and outside its anticipation window.", "#staggered-adoption"],
};

const methods = {
  common: ["Two-group DiD", "Target the treated group’s mean effect over a named period.", "An unexposed group observed at the same dates.", prePost, didLesson, "Read Difference-in-Differences"],
  staggered: ["Staggered cohort-time DiD", "Target the mean effect for one adoption cohort at a date, then choose explicit aggregation weights.", "Never-treated or still-untreated cohorts observed at the same dates. End follow-up before any anticipation in the comparison.", prePost, "#callaway-santanna", "Compare staggered adoption methods"],
  donor: ["Synthetic control or synthetic DiD", "Target a treated unit’s post-period gap or the average effect over a treated block.", "Unexposed donors and a long comparable pre-treatment outcome history.", "Pre-fit, donor support and a plausible continuation of the untreated comparison. For a treated block, inspect donor and time weights.", "#donor-methods", "Compare donor methods"],
  ddd: ["Triple differences", "Target eligible people in the program area or cohort.", "Both eligibility subgroups in both areas at both dates, with unaffected ineligible units.", "Parallel untreated eligibility-gap changes, stable composition, and all eight cells supported.", "#common-ddd", "Read common-adoption triple differences"],
  dddStaggered: ["Staggered triple differences", "Target eligible people in one adoption cohort and follow-up.", "A valid comparison cohort with both eligibility subgroups at both dates. Form cohort-specific contrasts before aggregation.", "Parallel untreated eligibility-gap changes, unaffected subgroups and eight-cell support at that horizon.", "#staggered-ddd", "Read staggered triple differences"],
  spillover: ["Spillover DiD", "Choose a direct, spillover, or joint effect at a specified horizon.", "Comparable units with observed own-treatment and neighbor-exposure combinations relevant to the selected effect.", "A credible exposure map, support in each comparison cell, and parallel counterfactual changes.", "#spillover-did", "Read spatial spillover DiD"],
  dose: ["Continuous-dose DiD", "Target the mean effect at an observed dose for units receiving that dose.", "Untreated comparisons observed at the same dates, with support at the dose of interest.", "Parallel untreated changes. A dose derivative for a fixed target needs stronger comparability across doses.", "#continuous-dose", "Read continuous-dose DiD"],
  boundary: ["DIDHAD", "Target a weighted average of dose-normalized effects under the no-stayers adoption design.", "Observed dose changes sufficiently close to zero to estimate the untreated boundary.", "Common untreated trends and continuity at zero. Inspect dose support and sensitivity to the boundary fit.", "#didhad", "Read the DIDHAD comparison"],
  switching: ["Intertemporal DiD", "Target switchers’ outcomes under their observed path versus remaining at their starting treatment.", "Stayers at the same initial treatment through the chosen horizon, with compatible treatment histories.", "Parallel counterfactual changes and a credible history/carryover specification. Verify support by horizon and switch direction.", "#intertemporal-did", "Read intertemporal DiD"],
  quantile: ["Changes-in-changes or additive quantile DiD", "Target a named treated-group quantile over a supported pre/post contrast.", "Comparable untreated distributions at baseline and follow-up.", "CiC uses common monotone transport and stable latent distributions. Additive quantile DiD assumes a parallel shift of that quantile.", "#quantile-did", "Compare quantile methods"],
  exit: ["Duration DiD", "Target cumulative exit by a named duration in the treated cohort.", "Unexposed comparable cohorts and observed survival at relevant dates.", "Check common additive hazard dynamics or proportional hazard increments, the censoring assumptions, and the risk sets.", "#duration-did", "Read duration DiD"],
  sharp: ["Sharp RD", "Target the effect for applicants at the cutoff.", "Scores and outcomes close to both sides of the documented rule.", "Local continuity and a single relevant change in assignment at the threshold. Check score sorting, balance, and bandwidth sensitivity.", rdLesson, "Read Regression Discontinuity"],
  fuzzy: ["Fuzzy RD", "Target the eligibility effect at the cutoff or, under additional assumptions, the local receipt effect for compliers.", "Scores, outcomes and receipt on both sides of the threshold.", "Continuity for the eligibility effect. The receipt effect requires exclusion, monotonicity and a sufficiently informative first stage.", rdLesson, "Read Regression Discontinuity"],
};

function choose({ target, waves, timing, pool, cutoff, exposure, independent, eligibility, dose, stayers }) {
  if (target === "cutoff" || waves === "post") {
    const earlier = waves === "post" ? "DiD needs an earlier outcome for both groups. " : "";
    if (methods[cutoff] && ["sharp", "fuzzy"].includes(cutoff)) {
      if (target === "quantile" || target === "exit") {
        return { gap: ["Cutoff candidate for a local mean", earlier + "A cutoff can support the local contrast taught in RD. Confirm an identification strategy for your requested distributional or duration target.", rdLesson] };
      }
      return { method: methods[cutoff], context: earlier };
    }
    return { gap: cutoff === "no" ? ["Assignment comparison missing", earlier + "RD requires a documented cutoff and observations close to both sides.", "#cutoff-designs"]
      : [gaps.cutoff[0], earlier + gaps.cutoff[1], gaps.cutoff[2]] };
  }
  if (waves === "unknown") return { gap: gaps.observations };
  if (timing === "unknown") return { gap: gaps.timing };
  if (exposure === "unknown") return { gap: gaps.exposure };
  const switching = timing === "switching" || timing === "mixed";
  const varyingDose = timing === "dose" || timing === "mixed";
  if (exposure === "all") return { gap: ["Unexposed comparison missing", "Every candidate control receives neighbor exposure. Define and observe an unexposed reference for a total effect or a supported common exposure level for a direct effect.", "#spillover-did"] };
  if (exposure === "known" && independent !== "yes") return { gap: independent === "no" ? gaps.separate
    : ["Provisional spillover design", `Check whether ${varyingDose ? "own dose" : "own treatment"} and neighbor exposure vary independently enough to support separate effects at the chosen horizon.`, "#spillover-did"] };
  if ((target === "quantile" || target === "exit") && (varyingDose || switching || exposure === "known")) {
    return { gap: ["Target and history need a joint design", "The mean-effect methods for these treatment paths and the simple distributional comparisons require different restrictions. Specify which path and exposure contrast should define the requested counterfactual distribution.", "#quantile-did"] };
  }
  if (switching) {
    if (waves === "repeated") return { gap: ["Linked treatment histories missing", "Intertemporal DiD needs treatment histories linked through follow-up for switchers and same-baseline stayers.", "#intertemporal-did"] };
    if (stayers !== "yes") return { gap: [stayers === "no" ? "Same-baseline comparison missing" : "Provisional switching design",
      "Confirm units with the same initial treatment and compatible history that stay at baseline through the selected horizon.", "#intertemporal-did"] };
    if (exposure === "known") return { gap: ["Joint path and exposure design needed", "Compare compatible histories at fixed neighbor exposure or define a joint path effect. Both comparisons need horizon-specific support.", "#spillover-did"] };
    return { method: methods.switching, context: timing === "mixed" ? "Track repeat switches and dose changes together. Check dose normalization, carryover and paths crossing baseline." : "" };
  }
  if (exposure === "known") return { method: methods.spillover, context: varyingDose ? "Compare different own doses at a fixed neighbor exposure and confirm dose support within those comparisons." : "" };
  if (varyingDose) {
    if (dose === "unknown") return { gap: ["Provisional dose design", "Check for untreated comparisons or sufficiently many near-zero dose changes.", "#dose-and-switching"] };
    if (dose === "far") return { gap: ["Untreated boundary lacks support", "Every dose change is bounded away from zero. A change at zero would require extrapolation or additional comparisons.", "#didhad"] };
    if (dose === "near-zero") return { method: methods.boundary };
    if (pool === "none") return { gap: gaps.none };
    if (pool === "unknown") return { gap: gaps.pool };
    return { method: methods.dose };
  }
  if (eligibility === "unknown" && target === "mean") return { gap: ["Provisional eligibility design", "Verify whether ineligible units are unaffected, observed in each group-date cell, and plausibly share a parallel untreated eligibility gap.", "#eligibility-and-exposure"] };
  if (pool === "unknown") return { gap: gaps.pool };
  if (pool === "none") return { gap: gaps.none };
  if (pool === "later" && timing === "common") return { gap: gaps.later };
  if (target === "quantile") return { method: methods.quantile, context: timing === "staggered" ? "Start with a cohort and a clean horizon, then state how to aggregate counterfactual distributions." : "" };
  if (target === "exit") return { method: methods.exit, context: timing === "staggered" ? "Align duration within a supported cohort comparison and check who remains at risk." : "" };
  if (eligibility === "yes") return { method: timing === "common" ? methods.ddd : methods.dddStaggered };
  if (pool === "donors" && timing === "common") return { method: methods.donor };
  return { method: timing === "common" ? methods.common : methods.staggered };
}

function update() {
  const values = Object.fromEntries(new FormData(form));
  const { target, waves, timing, exposure } = values;
  const cutoffRoute = target === "cutoff" || waves === "post";
  const history = !cutoffRoute && waves !== "unknown";
  const knownTiming = history && timing !== "unknown";
  const mean = target === "mean";
  const adoption = timing === "common" || timing === "staggered";
  const show = {
    cutoff: cutoffRoute, timing: history, exposure: knownTiming, independent: knownTiming && exposure === "known",
    pool: knownTiming && (adoption || (timing === "dose" && values.dose === "zero")) && exposure === "none",
    eligibility: knownTiming && adoption && mean && exposure === "none", dose: knownTiming && mean && timing === "dose" && exposure === "none",
    stayers: knownTiming && mean && (timing === "switching" || timing === "mixed") && exposure !== "all",
  };
  for (const field of all("[data-choose]", form)) field.hidden = !show[field.dataset.choose];
  const outcome = choose(values);
  if (outcome.gap) {
    const [title, detail, href] = outcome.gap;
    result.innerHTML = `<p><strong>${title}</strong></p><p>${detail}</p><p><a href="${href}">Review the design requirements</a></p>`;
    return;
  }
  const [title, effect, controls, assumptions, href, link] = outcome.method;
  result.innerHTML = `<p><strong>${title}</strong></p><p>${outcome.context ? outcome.context + " " : ""}${effect}</p>
    <dl class="causal-chooser-facts"><div><dt>Comparisons</dt><dd>${controls}</dd></div><div><dt>Verify</dt><dd>${assumptions}</dd></div></dl>
    <p><a href="${href}">${link}</a></p>`;
}

form.addEventListener("change", update);
form.addEventListener("submit", event => event.preventDefault());
update();
