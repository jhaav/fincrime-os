let TYPOLOGIES = [];

async function loadTypologies() {
  const res = await fetch('typologies.json');
  TYPOLOGIES = await res.json();
}

function scoreRule(rule, meta, scenario) {
  let score = 0;
  const text = scenario.toLowerCase();

  if (rule.domains && rule.domains.includes(meta.domain)) score += 2;
  if (rule.products && rule.products.includes(meta.product)) score += 2;
  if (rule.countries && (rule.countries.includes(meta.country) || rule.countries.includes('GLOBAL'))) {
    score += 1;
  }

  (rule.keywords_any || []).forEach(kw => {
    if (text.includes(kw.toLowerCase())) score += 1;
  });

  if (meta.crossBorder === 'Yes' && text.includes('cross border')) {
    score += 1;
  }

  return score;
}

function analyse(meta, scenario) {
  const scored = [];
  TYPOLOGIES.forEach(rule => {
    const s = scoreRule(rule, meta, scenario);
    if (s > 0) scored.push({ score: s, rule });
  });
  scored.sort((a, b) => b.score - a.score);

  const likelyTypologies = [];
  const redFlags = new Set();
  const checks = new Set();
  const sarAngles = new Set();
  const pitfalls = new Set();
  const countryNotes = new Set();
  let priority = "Low";
  const priorityReasons = [];

  if (scored.length === 0) {
    likelyTypologies.push("No strong typology match found – treat as generic suspicious behaviour and investigate manually.");
    checks.add("Clarify customer profile, transaction purpose, and counterparties in more detail.");
  } else {
    scored.slice(0, 3).forEach(item => {
      const rule = item.rule;
      likelyTypologies.push(rule.name);
      (rule.red_flags || []).forEach(r => redFlags.add(r));
      (rule.recommended_checks || []).forEach(c => checks.add(c));
      (rule.sar_str_angles || []).forEach(a => sarAngles.add(a));
      (rule.pitfalls || []).forEach(p => pitfalls.add(p));

      if (rule.country_notes) {
        const note = rule.country_notes[meta.country] || rule.country_notes['GLOBAL'];
        if (note) countryNotes.add(note);
      }

      priorityReasons.push(`${rule.name} matched with score ${item.score}.`);

      if (rule.base_priority === "High") {
        priority = "High";
      } else if (rule.base_priority === "Medium" && priority === "Low") {
        priority = "Medium";
      }
    });

    const lower = scenario.toLowerCase();
    if (lower.includes("high value") || lower.includes("large amount") || lower.includes("multiple banks")) {
      priority = "High";
      priorityReasons.push("Scenario text suggests high value or multi-bank exposure.");
    }
  }

  return {
    meta,
    likely_typologies: likelyTypologies,
    red_flags: Array.from(redFlags),
    recommended_checks: Array.from(checks),
    sar_str_angles: Array.from(sarAngles),
    priority_assessment: {
      level: priority,
      rationale: priorityReasons.join(" ")
    },
    country_notes: Array.from(countryNotes),
    pitfalls_to_avoid: Array.from(pitfalls)
  };
}

function buildNarrative(analysis) {
  const { meta } = analysis;
  const mainTypology = analysis.likely_typologies[0] || "suspicious behaviour";
  const countryName = {
    GLOBAL: "the relevant jurisdiction",
    IN: "India",
    EU: "the European Union",
    US: "the United States",
    OTHER: "the selected jurisdiction"
  }[meta.country] || "the selected jurisdiction";
  const domainNameMap = {
    marketplace: "marketplace / platform",
    psp: "payment gateway / PSP / fintech",
    banking: "banking",
    cards: "cards / chargebacks",
    crypto: "crypto / VASP",
    remittance: "remittance / MSB"
  };
  const domainName = domainNameMap[meta.domain] || "the selected domain";
  const product = meta.product || "the product in scope";
  const flags = analysis.red_flags.slice(0, 3).join(" ");

  return `The scenario describes potentially unusual activity in ${countryName} within the ${domainName} context for ${product}. 
Based on the observed pattern and available facts, the behaviour is broadly consistent with ${mainTypology}. 
Key concerns include: ${flags || "limited information on specific red flags so far"}. 
These characteristics may indicate elevated financial crime risk and justify a more detailed review of the customer's profile, 
business model, and transaction history before any final conclusion is reached.`;
}

function buildSARParagraph(analysis) {
  const { meta } = analysis;
  const mainTypology = analysis.likely_typologies[0] || "suspected suspicious activity";
  const countryName = {
    GLOBAL: "the institution's jurisdiction",
    IN: "India",
    EU: "an EU member state",
    US: "the United States",
    OTHER: "the relevant jurisdiction"
  }[meta.country] || "the institution's jurisdiction";
  const checks = analysis.recommended_checks.slice(0, 4).join("; ");

  return `This report relates to ${mainTypology} identified through review of activity in ${countryName}. 
The pattern appears inconsistent with the expected profile for this type of customer and product, in light of the following indicators: 
${analysis.red_flags.join("; ") || "limited documented red flags at this stage"}. 
Further actions recommended include: ${checks || "obtaining additional contextual information and supporting documents"}. 
Depending on the outcome of these steps, the institution may consider filing a Suspicious Transaction/Activity Report with the competent authority, 
in line with internal policies and applicable legal obligations.`;
}

function renderResults(result) {
  const resultsDiv = document.getElementById('results');
  const typologyPills = document.getElementById('typologyPills');
  const priorityPill = document.getElementById('priorityPill');
  const priorityReason = document.getElementById('priorityReason');
  const redFlags = document.getElementById('redFlags');
  const checks = document.getElementById('checks');
  const countryNotes = document.getElementById('countryNotes');
  const pitfalls = document.getElementById('pitfalls');
  const narrativeSummary = document.getElementById('narrativeSummary');
  const sarParagraph = document.getElementById('sarParagraph');

  typologyPills.innerHTML = '';
  result.likely_typologies.forEach(t => {
    const div = document.createElement('div');
    div.className = 'pill';
    div.textContent = t;
    typologyPills.appendChild(div);
  });

  priorityPill.innerHTML = '';
  const p = document.createElement('span');
  p.className = 'pill ' + result.priority_assessment.level.toLowerCase();
  p.textContent = 'Priority: ' + result.priority_assessment.level;
  priorityPill.appendChild(p);
  priorityReason.textContent = result.priority_assessment.rationale || '';

  narrativeSummary.textContent = buildNarrative(result);
  sarParagraph.textContent = buildSARParagraph(result);

  function fillList(el, arr) {
    el.innerHTML = '';
    if (!arr || arr.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'None suggested.';
      el.appendChild(li);
      return;
    }
    arr.forEach(item => {
      const li = document.createElement('li');
      li.textContent = item;
      el.appendChild(li);
    });
  }

  fillList(redFlags, result.red_flags);
  fillList(checks, result.recommended_checks);
  fillList(countryNotes, result.country_notes);
  fillList(pitfalls, result.pitfalls_to_avoid);

  resultsDiv.style.display = 'block';
}

function buildFullCardText(result) {
  let text = '';
  text += 'Likely typologies:\n';
  result.likely_typologies.forEach(t => { text += '- ' + t + '\n'; });
  text += '\nPriority: ' + result.priority_assessment.level + '\n';
  if (result.priority_assessment.rationale) {
    text += 'Why: ' + result.priority_assessment.rationale + '\n';
  }
  text += '\nNarrative summary:\n' + buildNarrative(result) + '\n\n';
  text += 'Draft STR / SAR paragraph:\n' + buildSARParagraph(result) + '\n\n';
  text += 'Red flags:\n';
  result.red_flags.forEach(r => { text += '- ' + r + '\n'; });
  text += '\nRecommended checks:\n';
  result.recommended_checks.forEach(c => { text += '- ' + c + '\n'; });
  text += '\nCountry / regulator notes:\n';
  result.country_notes.forEach(n => { text += '- ' + n + '\n'; });
  text += '\nPitfalls to avoid:\n';
  result.pitfalls_to_avoid.forEach(p => { text += '- ' + p + '\n'; });
  return text;
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadTypologies();

  const btn = document.getElementById('analyzeBtn');
  const copyAllBtn = document.getElementById('copyAllBtn');
  let lastResult = null;

  btn.addEventListener('click', () => {
    const meta = {
      country: document.getElementById('country').value,
      domain: document.getElementById('domain').value,
      product: document.getElementById('product').value,
      customerType: document.getElementById('customerType').value,
      amountBand: document.getElementById('amountBand').value,
      volumeBand: document.getElementById('volumeBand').value,
      crossBorder: document.getElementById('crossBorder').value
    };
    const scenario = document.getElementById('scenario').value.trim();

    if (!scenario) {
      alert('Please enter a brief scenario description.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Analysing...';

    setTimeout(() => {
      lastResult = analyse(meta, scenario);
      renderResults(lastResult);
      btn.disabled = false;
      btn.textContent = 'Analyse pattern';
    }, 120);
  });

  copyAllBtn.addEventListener('click', () => {
    if (!lastResult) return;
    const text = buildFullCardText(lastResult);
    navigator.clipboard.writeText(text).then(() => {
      copyAllBtn.textContent = 'Copied!';
      setTimeout(() => { copyAllBtn.textContent = 'Copy full card'; }, 1200);
    }).catch(() => {
      alert('Copy failed; your browser may not support Clipboard API.');
    });
  });
});
