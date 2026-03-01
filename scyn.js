const oldZipFile = [];
const newZipFile = [];
const oldRoleConceptMap = {};
const newRoleConceptMap = {};
const oldRoleOrder = [];
const newRoleOrder = [];


async function startCompare() {
    oldZipFile.length = 0;
    newZipFile.length = 0;
    oldPresentationRoles.length = 0;
    newPresentationRoles.length = 0;
    oldRoleOrder.length = 0;
    newRoleOrder.length = 0;
    oldFacts.length = 0;
    newFacts.length = 0;

    const oldFile = document.getElementById("oldZip").files[0];
    const newFile = document.getElementById("newZip").files[0];

    if (!oldFile || !newFile) {
        alert("Please select both zip files.");
        return;
    }

    await Promise.all([
        printZipContents(oldFile, "OLD ZIP"),
        printZipContents(newFile, "NEW ZIP")
    ]);


    for (const zipEntry of oldZipFile) {
        const name = zipEntry.name.toLowerCase();

        if (name.endsWith(".xsd")) {
            await parseXsdRoles(zipEntry, "OLDZIP");
        } else if (name.endsWith("_lab.xml")) {
            await parseLabelLinkbase(zipEntry, "OLDZIP");
        } else if (name.endsWith("_pre.xml")) {
            await presentationRoles(zipEntry, "OLDZIP");
        } else if (name.endsWith(".htm")) {
            await parseIxbrlFacts(zipEntry, "OLDZIP");
        } else if (name.endsWith("_def.xml")) {
            await parseDefinitionLinkbase(zipEntry, "OLDZIP");
        }
    }

    for (const zipEntry of newZipFile) {
        const name = zipEntry.name.toLowerCase();

        if (name.endsWith(".xsd")) {
            await parseXsdRoles(zipEntry, "NEWZIP");
        } else if (name.endsWith("_lab.xml")) {
            await parseLabelLinkbase(zipEntry, "NEWZIP");
        } else if (name.endsWith("_pre.xml")) {
            await presentationRoles(zipEntry, "NEWZIP");
        } else if (name.endsWith(".htm")) {
            await parseIxbrlFacts(zipEntry, "NEWZIP");
        } else if (name.endsWith("_def.xml")) {
            await parseDefinitionLinkbase(zipEntry, "NEWZIP");
        }
    }

    presentationRoleCompare();

}

async function printZipContents(file, label) {
    const zip = await JSZip.loadAsync(file);

    zip.forEach((relativePath, zipEntry) => {
        if (relativePath.toLowerCase().includes("docx")) return;

        if (label === "OLD ZIP") {
            oldZipFile.push(zipEntry);
        } else if (label === "NEW ZIP") {
            newZipFile.push(zipEntry);
        }
    });
}


const oldPresentationRoles = [];
const newPresentationRoles = [];

async function presentationRoles(zipEntry, fileName) {

    const xsdText = await zipEntry.async("text");
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xsdText, "application/xml");

    const roleRefs = xmlDoc.querySelectorAll("link\\:roleRef, roleRef");
    const roleRefMap = {};
    const roleOrder = [];

    for (const ref of roleRefs) {
        const roleURI = ref.getAttribute("roleURI");
        if (!roleURI) continue;

        if (fileName === "OLDZIP") {
            roleName = oldRoleDefMap[roleURI];
        } else {
            roleName = newRoleDefMap[roleURI];
        }


        if (roleName) {
            roleRefMap[roleURI] = roleName;
            roleOrder.push(roleName);
        }
    }

    const presentationLinks = xmlDoc.querySelectorAll("presentationLink, link\\:presentationLink");

    const roleConceptMap = {};

    for (const link of presentationLinks) {

        const roleURI = link.getAttribute("xlink:role");
        if (!roleURI || !roleRefMap[roleURI]) continue;

        const roleName = roleRefMap[roleURI];

        const locElements = link.querySelectorAll("link\\:loc, loc");
        const arcElements = link.querySelectorAll("link\\:presentationArc, presentationArc");

        const labelToConceptMap = {};

        for (const loc of locElements) {
            const label = loc.getAttribute("xlink:label");
            const href = loc.getAttribute("xlink:href");
            if (!label || !href) continue;

            const concept = href.split("#")[1];
            if (!concept) continue;

            labelToConceptMap[label] = concept;
        }

        const parentChildMap = {};
        const childSet = new Set();

        for (const arc of arcElements) {
            const from = arc.getAttribute("xlink:from");
            const to = arc.getAttribute("xlink:to");
            const order = parseFloat(arc.getAttribute("order") || 0);

            if (!labelToConceptMap[from] || !labelToConceptMap[to]) continue;

            const parent = labelToConceptMap[from];
            const child = labelToConceptMap[to];

            if (!parentChildMap[parent]) parentChildMap[parent] = [];

            const preferredLabel =
                arc.getAttribute("preferredLabel") ||
                arc.getAttribute("xlink:preferredLabel") ||
                arc.getAttributeNS("http://www.w3.org/1999/xlink", "preferredLabel");

            parentChildMap[parent].push({
                concept: child,
                order,
                preferredLabel
            });
            childSet.add(child);
        }

        for (const parent in parentChildMap) {
            parentChildMap[parent].sort((a, b) => a.order - b.order);
        }

        const flatList = [];

        function flatten(parent, preferredLabelRole = null) {
            flatList.push({
                concept: parent,
                preferredLabel: preferredLabelRole
            });

            if (parentChildMap[parent]) {
                for (const childObj of parentChildMap[parent]) {
                    flatten(childObj.concept, childObj.preferredLabel);
                }
            }
        }

        for (const parent in parentChildMap) {
            if (!childSet.has(parent)) {
                flatten(parent);
            }
        }

        roleConceptMap[roleName] = flatList;
    }

    for (const roleName of roleOrder) {

        const conceptList = roleConceptMap[roleName] || [];

        if (fileName === "OLDZIP") {
            oldRoleConceptMap[roleName] = conceptList;
            oldRoleOrder.push(roleName);
            oldPresentationRoles.push(roleName);
        } else {
            newRoleConceptMap[roleName] = conceptList;
            newRoleOrder.push(roleName);
            newPresentationRoles.push(roleName);
        }
    }
}


const oldRoleDefMap = {};
const newRoleDefMap = {};


async function parseXsdRoles(zipEntry, fileType) {


    const xmlText = await zipEntry.async("text");
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "application/xml");


    const roleTypes = xmlDoc.querySelectorAll("link\\:roleType, roleType");


    roleTypes.forEach(roleType => {


        const roleURI = roleType.getAttribute("roleURI");
        const definition = roleType.querySelector("link\\:definition, definition");


        if (!roleURI || !definition) return;


        const xsdRoleName = definition.textContent.trim();
        const roleName = xsdRoleName.replace(/^\d+\s*-\s*\w+\s*-\s*/, '');


        if (fileType === "OLDZIP") {
            oldRoleDefMap[roleURI] = roleName;
        } else {
            newRoleDefMap[roleURI] = roleName;
        }
    });
}

const oldFacts = [];
const newFacts = [];


async function parseIxbrlFacts(zipEntry, fileName) {

    const htmText = await zipEntry.async("text");
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(htmText, "application/xml");

    // Populate periods and units
    if (fileName === "OLDZIP") {
        Object.assign(oldPeriod, PeriodList(xmlDoc));
        Object.assign(oldUnit, UnitList(xmlDoc));
    } else {
        Object.assign(newPeriod, PeriodList(xmlDoc));
        Object.assign(newUnit, UnitList(xmlDoc));
    }

    // Pick the right maps
    const axisDomainMap = fileName === "OLDZIP"
        ? oldAxisDomainMap
        : newAxisDomainMap;

    const domainMemberMap = fileName === "OLDZIP"
        ? oldDomainMemberMap
        : newDomainMemberMap;

    const ixFacts = xmlDoc.querySelectorAll(
        "ix\\:nonFraction, ix\\:nonNumeric, nonFraction, nonNumeric"
    );

    ixFacts.forEach(fact => {

        const contextRef = fact.getAttribute("contextRef");
        const unitRef = fact.getAttribute("unitRef");
        const scale = fact.getAttribute("scale");
        const concept = fact.getAttribute("name");
        const value = fact.textContent.trim();
        const parentText = fact.parentNode ? fact.parentNode.textContent.trim() : value;

        let axisMembers = [];

        if (contextRef) {
            const contextNode = xmlDoc.querySelector(`context[id="${contextRef}"]`);
            if (contextNode) {
                const members = contextNode.querySelectorAll(
                    "xbrldi\\:explicitMember, explicitMember"
                );

                members.forEach(m => {
                    let axis = m.getAttribute("dimension");
                    let member = m.textContent.trim();
                    if (!axis || !member) return;

                    // 🔹 Normalize keys to match maps
                    const axisKey = axis.replace(":", "_");
                    const memberKey = member.replace(":", "_");

                    // Lookup domain from axisDomainMap
                    let domain = axisDomainMap[axisKey] || "";

                    // 🔹 Fallback: search domainMemberMap
                    if (!domain) {
                        Object.keys(domainMemberMap).forEach(d => {
                            const normalizedMembers = domainMemberMap[d].map(m => m.replace(":", "_"));
                            if (normalizedMembers.includes(memberKey)) domain = d;
                        });
                    }

                    axisMembers.push({
                        axis,
                        domain,
                        member
                    });
                });
            }
        }

        const factObj = {
            concept,
            value,
            contextRef,
            unitRef,
            scale,
            axisMembers,
            inlineSentence: parentText
        };

        if (fileName === "OLDZIP") {
            oldFacts.push(factObj);
        } else {
            newFacts.push(factObj);
        }
    });
}



// ==========================
// 🔹 TEXT NORMALIZATION
// ==========================
function normalize(str) {
    return (str || "")
        .toLowerCase()
        .replace(/\s+/g, "")
        .trim();
}

// ==========================
// 🔹 DICE COEFFICIENT (Better similarity)
// ==========================
function diceCoefficient(a, b) {

    if (!a.length || !b.length) return 0;
    if (a === b) return 1;

    function bigrams(str) {
        const result = [];
        for (let i = 0; i < str.length - 1; i++) {
            result.push(str.substring(i, i + 2));
        }
        return result;
    }

    const aBigrams = bigrams(a);
    const bBigrams = bigrams(b);
    const bCopy = [...bBigrams];

    let matches = 0;

    aBigrams.forEach(bg => {
        const index = bCopy.indexOf(bg);
        if (index !== -1) {
            matches++;
            bCopy.splice(index, 1);
        }
    });

    return (2 * matches) / (aBigrams.length + bBigrams.length);
}

// 🔹 BUILD MATCHING KEY
function buildKey(obj) {
    return normalize(obj?.concept) + "|" + normalize(obj?.label);
}

// 🔹 MAIN RENDER FUNCTION
function renderConceptTable(oldData = [], newData = []) {

    const tbody = document.querySelector(".content tbody");
    tbody.innerHTML = "";

    const usedNewIndexes = new Set();

    // 🔹 Build fast lookup map for exact matches
    const newMap = new Map();

    newData.forEach((item, index) => {
        const key = buildKey(item);
        if (!newMap.has(key)) {
            newMap.set(key, []);
        }
        newMap.get(key).push({ item, index });
    });

    // 🔹 RENDER OLD ROWS FIRST
    oldData.forEach(oldFact => {

        let newFact = {};
        let matchedIndex = -1;

        const oldKey = buildKey(oldFact);

        // 1️⃣ EXACT MATCH (FAST O(1))
        if (newMap.has(oldKey)) {
            const candidates = newMap.get(oldKey);

            const unused = candidates.find(c => !usedNewIndexes.has(c.index));
            if (unused) {
                newFact = unused.item;
                matchedIndex = unused.index;
            }
        }

        // 2️⃣ FUZZY MATCH (Only if no exact match)
        if (matchedIndex === -1) {

            let bestScore = 0;

            newData.forEach((candidate, idx) => {
                if (usedNewIndexes.has(idx)) return;

                const score = diceCoefficient(
                    oldKey,
                    buildKey(candidate)
                );

                if (score > bestScore) {
                    bestScore = score;
                    matchedIndex = idx;
                }
            });

            if (bestScore >= 0.75 && matchedIndex !== -1) {
                newFact = newData[matchedIndex];
            } else {
                matchedIndex = -1;
            }
        }

        if (matchedIndex !== -1) {
            usedNewIndexes.add(matchedIndex);
        }

        renderRow(oldFact, newFact, tbody);
    });

    // 🔹 RENDER REMAINING NEW ROWS
    newData.forEach((newFact, index) => {
        if (usedNewIndexes.has(index)) return;
        renderRow({}, newFact, tbody);
    });
}

// 🔹 ROW RENDERING
function renderRow(oldFact = {}, newFact = {}, tbody) {

    const tr = document.createElement("tr");

    function createCell(oldVal, newVal, side) {

        const td = document.createElement("td");

        const o = oldVal ?? "";
        const n = newVal ?? "";
        const value = side === "old" ? o : n;

        td.textContent = value || "-";
        td.title = value || "-";

        // ADDED
        if (!o && n && side === "new") {
            td.classList.add("cell-added");
        }

        // REMOVED
        else if (o && !n && side === "old") {
            td.classList.add("cell-removed");
        }

        // CHANGED
        else if (o && n && o !== n) {
            td.classList.add("cell-changed");
        }

        return td;
    }

    function createAxisCell(oldAxis, newAxis, side) {

        const td = document.createElement("td");

        const oldText = JSON.stringify(oldAxis || []);
        const newText = JSON.stringify(newAxis || []);
        const axisArray = side === "old" ? (oldAxis || []) : (newAxis || []);

        if (!axisArray.length) {
            td.textContent = "-";
        } else {
            const ul = document.createElement("ul");
            ul.style.margin = "0";
            ul.style.paddingLeft = "15px";

            axisArray.forEach(obj => {
                const li = document.createElement("li");
                li.innerHTML =
                    "<span style='font-size:10px'>" +
                    "<b>Axis:</b> " + obj.axis + "<br>" +
                    "<b>Member:</b> " + obj.member +
                    "</span>";
                ul.appendChild(li);
            });

            td.appendChild(ul);
        }

        // ADDED
        if ((!oldText || oldText === "[]") &&
            newText && newText !== "[]" &&
            side === "new") {
            td.classList.add("cell-added");
        }

        // REMOVED
        else if ((!newText || newText === "[]") &&
            oldText && oldText !== "[]" &&
            side === "old") {
            td.classList.add("cell-removed");
        }

        // CHANGED
        else if (oldText !== newText &&
            oldText !== "[]" &&
            newText !== "[]") {
            td.classList.add("cell-changed");
        }

        return td;
    }

    // CONCEPT
    tr.appendChild(createCell(oldFact.concept, newFact.concept, "old"));
    tr.appendChild(createCell(oldFact.concept, newFact.concept, "new"));

    // LABEL
    tr.appendChild(createCell(oldFact.label, newFact.label, "old"));
    tr.appendChild(createCell(oldFact.label, newFact.label, "new"));

    // VALUE
    tr.appendChild(createCell(oldFact.value, newFact.value, "old"));
    tr.appendChild(createCell(oldFact.value, newFact.value, "new"));

    // AXIS
    tr.appendChild(createAxisCell(oldFact.axisMembers, newFact.axisMembers, "old"));
    tr.appendChild(createAxisCell(oldFact.axisMembers, newFact.axisMembers, "new"));

    // PERIOD
    const oldPeriodVal = oldFact.contextRef ? oldPeriod[oldFact.contextRef] : "";
    const newPeriodVal = newFact.contextRef ? newPeriod[newFact.contextRef] : "";

    tr.appendChild(createCell(oldPeriodVal, newPeriodVal, "old"));
    tr.appendChild(createCell(oldPeriodVal, newPeriodVal, "new"));

    // UNIT
    const oldUnitVal = oldFact.unitRef ? oldUnit[oldFact.unitRef] : "";
    const newUnitVal = newFact.unitRef ? newUnit[newFact.unitRef] : "";

    tr.appendChild(createCell(oldUnitVal, newUnitVal, "old"));
    tr.appendChild(createCell(oldUnitVal, newUnitVal, "new"));

    // SCALE
    tr.appendChild(createCell(oldFact.scale, newFact.scale, "old"));
    tr.appendChild(createCell(oldFact.scale, newFact.scale, "new"));

    // SENTENCE
    tr.appendChild(createCell(oldFact.inlineSentence, newFact.inlineSentence, "old"));
    tr.appendChild(createCell(oldFact.inlineSentence, newFact.inlineSentence, "new"));

    tbody.appendChild(tr);
}

document.querySelector(".presentationRole").addEventListener("click", function (e) {

    if (!e.target.classList.contains("role-btn")) return;

    document.querySelectorAll('.role-btn').forEach(btn => {
        btn.classList.remove("active")
    })

    e.target.classList.add("active")

    const roleName = e.target.textContent.trim();
    filterFactsByRole(roleName);
});


function filterFactsByRole(roleName) {

    let oldConcepts = oldRoleConceptMap[roleName] || [];
    let newConcepts = newRoleConceptMap[roleName] || [];

    const normalize = (str) =>
        typeof str === "string"
            ? str.toLowerCase().replace(":", "_").trim()
            : "";

    // function isStructuralConcept(name) {
    //     return /table|axis|domain|member|lineitems/i.test(name);
    // }

    function extractFacts(factsArray, conceptName) {

        const seen = new Set();
        const result = [];

        factsArray.forEach(fact => {

            if (normalize(fact.concept) !== normalize(conceptName)) return;

            const key =
                normalize(fact.concept) + "|" +
                (fact.contextRef || "") + "|" +
                (fact.unitRef || "") + "|" +
                (fact.scale || "") + "|" +
                (fact.value || "");

            if (!seen.has(key)) {
                seen.add(key);
                result.push(fact);
            }
        });

        return result;
    }

    const orderedOld = [];
    const orderedNew = [];

    // 🔵 OLD SIDE
    const oldRoleConceptSet = new Set(
        oldConcepts.map(c => normalize(c.concept))
    );

    oldConcepts.forEach(conceptObj => {

        const conceptName = conceptObj.concept;

        // if (isStructuralConcept(conceptName)) return;

        const label = getPreferredLabel(conceptObj, "OLDZIP");
        const facts = extractFacts(oldFacts, conceptName);

        if (facts.length === 0) {
            orderedOld.push({
                concept: conceptName,
                label,
                value: "-",
                axisMembers: []
            });
        } else {
            facts.forEach(f => {

                let filteredAxis = [];

                // ✅ If fact has dimensions, validate them against role
                if (f.axisMembers && f.axisMembers.length > 0) {

                    filteredAxis = f.axisMembers.filter(a =>
                        oldRoleConceptSet.has(normalize(a.axis)) &&
                        oldRoleConceptSet.has(normalize(a.member))
                    );

                    // ❌ If none of the dimensions belong to this role → skip fact
                    if (filteredAxis.length === 0) {
                        return;
                    }
                }

                orderedOld.push({
                    ...f,
                    concept: conceptName,
                    label,
                    axisMembers: filteredAxis
                });
            });
        }
    });


    // 🔵 NEW SIDE
    const newRoleConceptSet = new Set(
        newConcepts.map(c => normalize(c.concept))
    );

    newConcepts.forEach(conceptObj => {

        const conceptName = conceptObj.concept;

        // if (isStructuralConcept(conceptName)) return;

        const label = getPreferredLabel(conceptObj, "NEWZIP");
        const facts = extractFacts(newFacts, conceptName);

        if (facts.length === 0) {
            orderedNew.push({
                concept: conceptName,
                label,
                value: "-",
                axisMembers: []
            });
        } else {
            facts.forEach(f => {

                let filteredAxis = [];

                if (f.axisMembers && f.axisMembers.length > 0) {

                    filteredAxis = f.axisMembers.filter(a =>
                        newRoleConceptSet.has(normalize(a.axis)) &&
                        newRoleConceptSet.has(normalize(a.member))
                    );

                    if (filteredAxis.length === 0) {
                        return;
                    }
                }

                orderedNew.push({
                    ...f,
                    concept: conceptName,
                    label,
                    axisMembers: filteredAxis
                });
            });
        }
    });

    renderConceptTable(orderedOld, orderedNew);
}


function similarity(a, b) {
    const normalize = str => str.toLowerCase().replace(/\s+/g, '');
    a = normalize(a);
    b = normalize(b);

    if (a === b) return 1;

    const bigrams = str => {
        const result = [];
        for (let i = 0; i < str.length - 1; i++) {
            result.push(str.slice(i, i + 2));
        }
        return result;
    };

    const aBigrams = bigrams(a);
    const bBigrams = bigrams(b);

    const intersection = aBigrams.filter(bg => bBigrams.includes(bg));

    return (2 * intersection.length) / (aBigrams.length + bBigrams.length);
}

function presentationRoleCompare() {

    const sameRoles = [];
    const differentRoles = [];

    const minLength = Math.min(oldPresentationRoles.length, newPresentationRoles.length);

    for (let i = 0; i < minLength; i++) {
        const oldRoleClean = properRoleName(oldPresentationRoles[i]);
        const newRoleClean = properRoleName(newPresentationRoles[i]);

        if (oldRoleClean === newRoleClean) {
            sameRoles.push(oldPresentationRoles[i]);
        } else {
            differentRoles.push({
                old: oldPresentationRoles[i],
                new: newPresentationRoles[i]
            });
        }
    }


    let presentationRole = document.getElementsByClassName("presentationRole")[0];
    presentationRole.innerHTML = "";

    newPresentationRoles.forEach((role, index) => {
        let roleBtn = document.createElement("button");
        roleBtn.textContent = role;
        roleBtn.className = "role-btn";

        if (index === 0) {
            roleBtn.classList.add("active")
        }
        presentationRole.appendChild(roleBtn);
    });

    const firstBtn = presentationRole.querySelector(".role-btn");

    if (firstBtn) {
        const firstRole = firstBtn.textContent.trim();
        filterFactsByRole(firstRole);
    }
};


const oldPeriod = {};
const newPeriod = {};

function PeriodList(xmlDoc) {

    const contextMap = {};
    const contexts = xmlDoc.querySelectorAll("xbrli\\:context, context");

    contexts.forEach(ctx => {

        const id = ctx.getAttribute("id");
        if (!id) return;

        const instant = ctx.querySelector("xbrli\\:instant, instant");
        const start = ctx.querySelector("xbrli\\:startDate, startDate");
        const end = ctx.querySelector("xbrli\\:endDate, endDate");

        if (instant) {
            contextMap[id] = instant.textContent.trim();
        }
        else if (start && end) {
            contextMap[id] =
                start.textContent.trim() + " to " +
                end.textContent.trim();
        }
    });

    return contextMap;
}

const oldUnit = {};
const newUnit = {};

function UnitList(xmlDoc) {
    const unitMap = {};
    const units = xmlDoc.querySelectorAll("xbrli\\:unit, unit");

    units.forEach(unit => {
        const id = unit.getAttribute("id");

        if (!id) return;
        const measure = unit.querySelector("xbrli\\:measure, measure");
        if (measure) {
            unitMap[id] = measure.textContent.trim().split(":").pop();
        }
    });

    return unitMap;
}

const oldLabelMap = {};
const newLabelMap = {};

async function parseLabelLinkbase(zipEntry, fileName) {


    const xmlText = await zipEntry.async("text");
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "application/xml");

    const labelArcs = xmlDoc.querySelectorAll("link\\:labelArc, labelArc");
    const labelLocs = xmlDoc.querySelectorAll("link\\:loc, loc");
    const labels = xmlDoc.querySelectorAll("link\\:label, label");

    const labelToConcept = {};
    const labelIdMap = {};

    labelLocs.forEach(loc => {
        const label = loc.getAttribute("xlink:label");
        const href = loc.getAttribute("xlink:href");
        if (!label || !href) return;

        const concept = href.split("#")[1];
        labelToConcept[label] = concept;
    });

    labels.forEach(label => {
        const labelId = label.getAttribute("xlink:label");
        const role = label.getAttribute("xlink:role")?.trim();
        const text = label.textContent.trim();

        if (!labelIdMap[labelId]) {
            labelIdMap[labelId] = [];
        }
        labelIdMap[labelId].push({
            role: role,
            text: text
        });

    });

    const conceptLabelMap = {};

    labelArcs.forEach(arc => {
        const from = arc.getAttribute("xlink:from");
        const to = arc.getAttribute("xlink:to");

        const concept = labelToConcept[from];
        const labelData = labelIdMap[to];

        if (!concept || !labelData) return;

        if (!conceptLabelMap[concept]) {
            conceptLabelMap[concept] = {};
        }

        labelData.forEach(label => {
            if (label.role) {
                conceptLabelMap[concept][label.role] = label.text;
            }
        });
    });

    if (fileName === "OLDZIP") {
        Object.assign(oldLabelMap, conceptLabelMap);
    } else {
        Object.assign(newLabelMap, conceptLabelMap);
    }
}

function getPreferredLabel(conceptObj, fileType) {

    const concept = conceptObj.concept;
    const preferredRole = conceptObj.preferredLabel?.trim();

    const labelMap = fileType === "OLDZIP"
        ? oldLabelMap
        : newLabelMap;

    if (!labelMap[concept]) return "-";

    const conceptLabels = labelMap[concept];

    if (preferredRole && conceptLabels[preferredRole]) {
        return conceptLabels[preferredRole];
    }

    const standardRole = "http://www.xbrl.org/2003/role/label";

    if (conceptLabels[standardRole]) {
        return conceptLabels[standardRole];
    }

    return Object.values(conceptLabels)[0] || "-";
}

function properRoleName(role) {
    let properRole = role
        .replace(/\(unaudited\)/gi, "")
        .replace(/\bunaudited\b/gi, "")
        .replace(/\baudited\b/gi, "")
        .replace(/\bcondensed\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();

    if (properRole === "Document And Entity Information") {
        properRole = "Cover";
    }

    return properRole;
}