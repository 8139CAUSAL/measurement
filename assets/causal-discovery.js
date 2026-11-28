import { normalP } from "./experiment-stats.js";
import { $, decimal, signed, table } from "./experiment-tools.js";

const examples = {
  chain: { ab: .60, bc: .60, ac: .36 },
  fork: { ab: .60, bc: .60, ac: .36 },
  collider: { ab: .60, bc: .60, ac: 0 },
  finite: { ab: .60, bc: .30, ac: .10, n: 24 },
};

export function discovery(mode) {
  const { ab, bc, ac, n } = examples[mode];
  const partial = (ac - ab * bc) / Math.sqrt((1 - ab * ab) * (1 - bc * bc));
  const tests = [["A and B", ab, 0], ["B and C", bc, 0], ["A and C", ac, 0], ["A and C", partial, 1]]
    .map(([pair, r, conditional]) => {
      const p = n ? normalP(Math.atanh(r) * Math.sqrt(n - conditional - 3)) : null;
      return { pair, r, conditional, p, independent: n ? p >= .05 : Math.abs(r) < 1e-10 };
    });
  // PC uses the first separating set it finds, starting with the empty set.
  const acSet = tests[2].independent ? "∅" : tests[3].independent ? "{B}" : null;
  const collider = acSet === "∅" && !tests[0].independent && !tests[1].independent;
  return { tests, acSet, collider };
}

const example = $("#discovery-example");
const condition = $("#discovery-condition");
const reveal = $("#discovery-reveal");
let step = 0;

function update() {
  const { tests, acSet, collider } = discovery(example.value);
  const finite = example.value === "finite";
  const rows = tests.slice(0, step ? tests.length : 3).map(({ pair, r, conditional, p, independent }) => [
    pair, conditional ? "B" : "None", signed(r, 3), p === null ? "Population" : decimal(p, 3),
    p === null ? (independent ? "Independent" : "Dependent") : (independent ? "Fail to reject independence" : "Reject independence"),
  ]);
  $("#discovery-tests").innerHTML = table(["Variables", "Condition on", "Correlation", "Two-sided p", "Evidence"],
    rows, finite ? "Finite-sample Fisher z tests at α = 0.05" : "Population independence evidence");
  condition.setAttribute("aria-pressed", String(step > 0));
  reveal.disabled = !step;
  reveal.setAttribute("aria-pressed", String(step === 2));
  const status = $("#discovery-status");
  const edges = $("#discovery-edges");
  const graph = $("#discovery-graph");
  edges.replaceChildren();
  if (step === 0) {
    graph.textContent = "Candidate edges · A — B, B — C, A — C";
    status.textContent = "Compare the unconditional evidence, then condition on the middle node B.";
    return;
  }
  if (step === 1) {
    graph.textContent = "Conditional comparison · A and C within levels of B";
    status.textContent = tests[3].independent
      ? "The conditional evidence supports removal of A—C. Check whether the algorithm already found a smaller separating set."
      : "Conditioning on B reveals dependence. Check which separating set was found when A and C were tested marginally.";
    return;
  }
  if (finite) {
    graph.textContent = "Inferred graph · A — B and isolated C";
    status.textContent = "Only A—B survives. The replay fails to detect B—C, so the unshielded collider never appears. The population collider has both edges.";
  } else if (collider) {
    graph.textContent = "Inferred graph · A → B ← C";
    status.textContent = "A and C are nonadjacent and B is absent from their separating set. PC orients the unshielded triple as A → B ← C.";
  } else {
    graph.textContent = "Inferred graph · A — B — C";
    status.textContent = "B belongs to the separating set for A and C. The arrows stay unoriented in the CPDAG A — B — C.";
  }
  edges.innerHTML = table(["PC result", "Evidence or graph"], [
    ["Removed edge A—C", `Separating set ${acSet}`],
    ["Edge B—C", finite ? "Removed after the marginal test (separating set ∅)" : "Retained"],
    ["Edge A—B", "Retained"],
    ["Estimated equivalence class", finite ? "A — B and isolated C" : collider
      ? "A → B ← C" : "A → B → C, A ← B ← C, or A ← B → C"],
  ]);
}
example.addEventListener("change", () => { step = 0; update(); });
condition.addEventListener("click", () => { step = 1; update(); });
reveal.addEventListener("click", () => { step = 2; update(); });
update();
