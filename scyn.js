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
        if (zipEntry.name.toLowerCase().endsWith("_pre.xml")) {
            await presentationRoles(zipEntry, "OLDZIP");
        } else if (zipEntry.name.toLowerCase().endsWith("_lab.xml")) {
            await parseLabelLinkbase(zipEntry, "OLDZIP");
        } else if (zipEntry.name.toLowerCase().endsWith(".xsd")) {
            await parseXsdRoles(zipEntry, "OLDZIP");
        } else if (zipEntry.name.toLowerCase().endsWith(".htm")) {
            await parseIxbrlFacts(zipEntry, "OLDZIP");
        }

    }

    for (const zipEntry of newZipFile) {
        if (zipEntry.name.toLowerCase().endsWith("_pre.xml")) {
            await presentationRoles(zipEntry, "NEWZIP");
        } else if (zipEntry.name.toLowerCase().endsWith("_lab.xml")) {
            await parseLabelLinkbase(zipEntry, "NEWZIP");
        } else if (zipEntry.name.toLowerCase().endsWith(".xsd")) {
            await parseXsdRoles(zipEntry, "NEWZIP");
        } else if (zipEntry.name.toLowerCase().endsWith(".htm")) {
            await parseIxbrlFacts(zipEntry, "NEWZIP");
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

    if (fileName === "OLDZIP") {
        Object.assign(oldPeriod, PeriodList(xmlDoc));
    } else {
        Object.assign(newPeriod, PeriodList(xmlDoc));
    }

    if (fileName === "OLDZIP") {
        Object.assign(oldUnit, UnitList(xmlDoc));
    } else {
        Object.assign(newUnit, UnitList(xmlDoc));
    }

    let ixFacts = xmlDoc.querySelectorAll(
        "ix\\:nonFraction, ix\\:nonNumeric, nonFraction, nonNumeric"
    );

    ixFacts.forEach(fact => {

        const factValue = fact.textContent.trim();
        const parentText = fact.parentNode ? fact.parentNode.textContent.trim() : factValue;
        const startIndex = parentText.indexOf(factValue);

        const factObj = {
            concept: fact.getAttribute("name"),
            value: fact.textContent.trim(),
            contextRef: fact.getAttribute("contextRef"),
            unitRef: fact.getAttribute("unitRef"),
            scale: fact.getAttribute("scale"),
            inlineSentence: parentText.slice(0, startIndex) + factValue + parentText.slice(startIndex + factValue.length)
        };

        if (fileName === "OLDZIP") {
            oldFacts.push(factObj);
        } else {
            newFacts.push(factObj);
        }

    });
}


function renderConceptTable(oldData = oldFacts, newData = newFacts) {

    const tbody = document.querySelector(".content tbody");
    tbody.innerHTML = "";

    // const allConcepts = new Set([
    //     ...oldData.map(f => f.concept),
    //     ...newData.map(f => f.concept)
    // ]);

    // allConcepts.forEach(concept => {

    //     const tr = document.createElement("tr");

    //     const oldFact = oldData.find(f => f.concept === concept);
    //     const newFact = newData.find(f => f.concept === concept);

    //     function createPair(oldVal, newVal) {

    //         const oldTd = document.createElement("td");
    //         const newTd = document.createElement("td");

    //         const oldValue = oldVal ?? "";
    //         const newValue = newVal ?? "";

    //         oldTd.textContent = oldValue || "-";
    //         newTd.textContent = newValue || "-";

    //         oldTd.title = oldValue || "-";
    //         newTd.title = newValue || "-";

    //         const oldEmpty = oldValue === "";
    //         const newEmpty = newValue === "";

    //         if (oldEmpty && !newEmpty) {
    //             newTd.classList.add("cell-added");
    //         }
    //         else if (!oldEmpty && newEmpty) {
    //             oldTd.classList.add("cell-removed");
    //         }
    //         else if (!oldEmpty && !newEmpty && oldValue !== newValue) {
    //             oldTd.classList.add("cell-changed");
    //             newTd.classList.add("cell-changed");
    //         }

    //         tr.appendChild(oldTd);
    //         tr.appendChild(newTd);
    //     }

    //     createPair(oldFact?.concept, newFact?.concept);
    //     createPair(oldFact?.label, newFact?.label);
    //     createPair(oldFact?.value, newFact?.value);

    //     const oldPeriodVal = oldFact?.contextRef ? oldPeriod[oldFact.contextRef] : "";
    //     const newPeriodVal = newFact?.contextRef ? newPeriod[newFact.contextRef] : "";
    //     createPair(oldPeriodVal, newPeriodVal);

    //     const oldUnitVal = oldFact?.unitRef ? oldUnit[oldFact.unitRef] : "";
    //     const newUnitVal = newFact?.unitRef ? newUnit[newFact.unitRef] : "";
    //     createPair(oldUnitVal, newUnitVal);

    //     createPair(oldFact?.scale, newFact?.scale);
    //     createPair(oldFact?.inlineSentence, newFact?.inlineSentence);

    //     tbody.appendChild(tr);
    // });

    const usedNewIndexes = new Set();

    oldData.forEach((oldFact, oldIndex) => {

        let bestMatchIndex = -1;
        let bestScore = 0;

        newData.forEach((newFact, newIndex) => {
            if (usedNewIndexes.has(newIndex)) return;

            const score = similarity(
                oldFact?.concept || "",
                newFact?.concept || ""
            );

            if (score > bestScore) {
                bestScore = score;
                bestMatchIndex = newIndex;
            }
        });

        let newFact = null;

        if (bestScore >= 0.6 && bestMatchIndex !== -1) {
            newFact = newData[bestMatchIndex];
            usedNewIndexes.add(bestMatchIndex);
        }

        const tr = document.createElement("tr");

        function createPair(oldVal, newVal) {

            const oldTd = document.createElement("td");
            const newTd = document.createElement("td");

            const oldValue = oldVal ?? "";
            const newValue = newVal ?? "";

            oldTd.textContent = oldValue || "-";
            newTd.textContent = newValue || "-";

            oldTd.title = oldValue || "-";
            newTd.title = newValue || "-";

            const oldEmpty = oldValue === "";
            const newEmpty = newValue === "";

            if (oldEmpty && !newEmpty) {
                newTd.classList.add("cell-added");
            }
            else if (!oldEmpty && newEmpty) {
                oldTd.classList.add("cell-removed");
            }
            else if (!oldEmpty && !newEmpty && oldValue !== newValue) {
                oldTd.classList.add("cell-changed");
                newTd.classList.add("cell-changed");
            }

            tr.appendChild(oldTd);
            tr.appendChild(newTd);
        }

        createPair(oldFact?.concept, newFact?.concept);
        createPair(oldFact?.label, newFact?.label);
        createPair(oldFact?.value, newFact?.value);

        const oldPeriodVal = oldFact?.contextRef ? oldPeriod[oldFact.contextRef] : "";
        const newPeriodVal = newFact?.contextRef ? newPeriod[newFact?.contextRef] : "";
        createPair(oldPeriodVal, newPeriodVal);

        const oldUnitVal = oldFact?.unitRef ? oldUnit[oldFact.unitRef] : "";
        const newUnitVal = newFact?.unitRef ? newUnit[newFact?.unitRef] : "";
        createPair(oldUnitVal, newUnitVal);

        createPair(oldFact?.scale, newFact?.scale);
        createPair(oldFact?.inlineSentence, newFact?.inlineSentence);

        tbody.appendChild(tr);
    });


    // Add remaining NEW concepts (not matched)
    newData.forEach((newFact, index) => {
        if (usedNewIndexes.has(index)) return;

        const tr = document.createElement("tr");

        function createPair(oldVal, newVal) {
            const oldTd = document.createElement("td");
            const newTd = document.createElement("td");

            oldTd.textContent = oldVal || "-";
            newTd.textContent = newVal || "-";

            if (!oldVal && newVal) {
                newTd.classList.add("cell-added");
            }

            tr.appendChild(oldTd);
            tr.appendChild(newTd);
        }

        createPair("", newFact?.concept);
        createPair("", newFact?.label);
        createPair("", newFact?.value);

        const newPeriodVal = newFact?.contextRef ? newPeriod[newFact.contextRef] : "";
        createPair("", newPeriodVal);

        const newUnitVal = newFact?.unitRef ? newUnit[newFact.unitRef] : "";
        createPair("", newUnitVal);

        createPair("", newFact?.scale);
        createPair("", newFact?.inlineSentence);

        tbody.appendChild(tr);
    });
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

    // Try exact match first
    let oldConcepts = oldRoleConceptMap[roleName];
    let newConcepts = newRoleConceptMap[roleName];

    // If exact match not found, try similar
    if (!oldConcepts) {
        const similarOld = getSimilarRole(roleName, oldRoleConceptMap);
        oldConcepts = similarOld ? oldRoleConceptMap[similarOld] : [];
    }

    if (!newConcepts) {
        const similarNew = getSimilarRole(roleName, newRoleConceptMap);
        newConcepts = similarNew ? newRoleConceptMap[similarNew] : [];
    }

    const normalize = (str) =>
        typeof str === "string"
            ? str.toLowerCase().replace(":", "_").trim()
            : "";

    const orderedOld = [];
    const orderedNew = [];

    // OLD
    oldConcepts.forEach(conceptObj => {
        const conceptName = conceptObj.concept;
        const fact = oldFacts.find(f =>
            normalize(f.concept) === normalize(conceptName)
        );

        orderedOld.push({
            ...(fact || {}),
            concept: conceptName,
            label: getPreferredLabel(conceptObj, "OLDZIP")
        });
    });

    // NEW
    newConcepts.forEach(conceptObj => {
        const conceptName = conceptObj.concept;
        const fact = newFacts.find(f =>
            normalize(f.concept) === normalize(conceptName)
        );

        orderedNew.push({
            ...(fact || {}),
            concept: conceptName,
            label: getPreferredLabel(conceptObj, "NEWZIP")
        });
    });

    renderConceptTable(orderedOld, orderedNew);
}



function renderPresentationRoles() {

    const container = document.querySelector(".presentationRole");
    container.innerHTML = "";

    oldRoleOrder.forEach(role => {

        const div = document.createElement("div");
        div.textContent = role;
        div.style.cursor = "pointer";
        div.style.padding = "6px";

        container.appendChild(div);
    });
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
    const similarRoles = [];
    const matchedOldIndexes = new Set();
    const matchedNewIndexes = new Set();

    oldPresentationRoles.forEach((oldRole, oldIndex) => {
        let bestMatchIndex = -1;
        let bestScore = 0;

        newPresentationRoles.forEach((newRole, newIndex) => {
            if (matchedNewIndexes.has(newIndex)) return;

            const score = similarity(oldRole, newRole);

            if (score > bestScore) {
                bestScore = score;
                bestMatchIndex = newIndex;
            }
        });

        if (bestScore === 1) {
            sameRoles.push(oldRole);
            matchedOldIndexes.add(oldIndex);
            matchedNewIndexes.add(bestMatchIndex);
        }
        else if (bestScore >= 0.6) {
            similarRoles.push({
                old: oldRole,
                new: newPresentationRoles[bestMatchIndex],
                similarity: Math.round(bestScore * 100) + "%"
            });
            matchedOldIndexes.add(oldIndex);
            matchedNewIndexes.add(bestMatchIndex);
        }
    });

    // const addedRoles = newPresentationRoles.filter((_, i) => !matchedNewIndexes.has(i));
    // const removedRoles = oldPresentationRoles.filter((_, i) => !matchedOldIndexes.has(i));


    let presentationRole = document.getElementsByClassName("presentationRole")[0];
    presentationRole.innerHTML = "";

    newPresentationRoles.forEach(role => {
        let roleBtn = document.createElement("button");
        roleBtn.textContent = role;
        roleBtn.className = "role-btn";
        presentationRole.appendChild(roleBtn);
    });

    // if (removedRoles.length > 0) {
    //     let removeHeading = document.createElement("h4");
    //     removeHeading.textContent = "Remove List";
    //     presentationRole.appendChild(removeHeading);

    //     removedRoles.forEach(role => {
    //         let p = document.createElement("button");
    //         p.textContent = role;
    //         p.className = "role-btn";
    //         presentationRole.appendChild(p);
    //     });
    // }

    // if (addedRoles.length > 0) {
    //     let addedHeading = document.createElement("h4");
    //     addedHeading.textContent = "Added List";
    //     presentationRole.appendChild(addedHeading);

    //     addedRoles.forEach(role => {
    //         let p = document.createElement("button");
    //         p.textContent = role;
    //         p.className = "role-btn";
    //         presentationRole.appendChild(p);
    //     });
    // }

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

function getSimilarRole(roleName, roleMap) {
    let bestMatch = null;
    let bestScore = 0;

    Object.keys(roleMap).forEach(r => {
        const score = similarity(roleName, r);
        if (score > bestScore) {
            bestScore = score;
            bestMatch = r;
        }
    });

    return bestScore >= 0.8 ? bestMatch : null;
}




async function exportToExcel() {
    if (typeof ExcelJS === "undefined") {
        alert("Please include ExcelJS library!");
        return;
    }

    const workbook = new ExcelJS.Workbook();
    const sheetNames = new Set(); // Track used sheet names

    for (const role of newPresentationRoles) {
        let baseName = role.substring(0, 31); // Excel max 31 chars
        let sheetName = baseName;
        let counter = 1;

        // Handle duplicate sheet names
        while (sheetNames.has(sheetName)) {
            const suffix = counter.toString();
            sheetName = baseName.substring(0, 31 - suffix.length) + suffix;
            counter++;
        }
        sheetNames.add(sheetName);

        const sheet = workbook.addWorksheet(sheetName);

        // Filter facts by this role
        let oldConcepts = oldRoleConceptMap[role] || [];
        let newConcepts = newRoleConceptMap[role] || [];

        const normalize = str => typeof str === "string" ? str.toLowerCase().replace(":", "_").trim() : "";

        const orderedOld = oldConcepts.map(conceptObj => {
            const conceptName = conceptObj.concept;
            const fact = oldFacts.find(f => normalize(f.concept) === normalize(conceptName));
            return {
                ...(fact || {}),
                concept: conceptName,
                label: getPreferredLabel(conceptObj, "OLDZIP")
            };
        });

        const orderedNew = newConcepts.map(conceptObj => {
            const conceptName = conceptObj.concept;
            const fact = newFacts.find(f => normalize(f.concept) === normalize(conceptName));
            return {
                ...(fact || {}),
                concept: conceptName,
                label: getPreferredLabel(conceptObj, "NEWZIP")
            };
        });

        // Header row
        sheet.addRow([
            "Old Concept", "New Concept",
            "Old Label", "New Label",
            "Old Value", "New Value",
            "Old Period", "New Period",
            "Old Unit", "New Unit",
            "Old Scale", "New Scale",
            "Old Inline Sentence", "New Inline Sentence"
        ]);

        const usedNewIndexes = new Set();

        // Match old and new facts
        orderedOld.forEach(oldFact => {
            let bestMatchIndex = -1;
            let bestScore = 0;

            orderedNew.forEach((newFact, idx) => {
                if (usedNewIndexes.has(idx)) return;
                const score = similarity(oldFact.concept, newFact.concept);
                if (score > bestScore) {
                    bestScore = score;
                    bestMatchIndex = idx;
                }
            });

            let newFact = null;
            if (bestScore >= 0.6 && bestMatchIndex !== -1) {
                newFact = orderedNew[bestMatchIndex];
                usedNewIndexes.add(bestMatchIndex);
            }

            const row = sheet.addRow([
                oldFact?.concept || "", newFact?.concept || "",
                oldFact?.label || "", newFact?.label || "",
                oldFact?.value || "", newFact?.value || "",
                oldFact?.contextRef ? oldPeriod[oldFact.contextRef] : "", newFact?.contextRef ? newPeriod[newFact.contextRef] : "",
                oldFact?.unitRef ? oldUnit[oldFact.unitRef] : "", newFact?.unitRef ? newUnit[newFact.unitRef] : "",
                oldFact?.scale || "", newFact?.scale || "",
                oldFact?.inlineSentence || "", newFact?.inlineSentence || ""
            ]);

            // Apply colors only on changed cells
            for (let col = 1; col <= row.cellCount; col += 2) {
                const oldCell = row.getCell(col);
                const newCell = row.getCell(col + 1);

                const oldVal = oldCell.value;
                const newVal = newCell.value;

                if (!oldVal && newVal) {
                    newCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB6D7A8' } }; // Green added
                } else if (oldVal && !newVal) {
                    oldCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4C7C3' } }; // Red removed
                } else if (oldVal && newVal && oldVal !== newVal) {
                    newCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } }; // Yellow changed
                }
                
                //both side color
                // else if (oldVal && newVal && oldVal !== newVal) {
                //     const yellowFill = {
                //         type: 'pattern',
                //         pattern: 'solid',
                //         fgColor: { argb: 'FFFFF2CC' } // Yellow changed
                //     };

                //     oldCell.fill = yellowFill;
                //     newCell.fill = yellowFill;
                // }
            }
        });

        // Add remaining new facts not matched
        orderedNew.forEach((newFact, idx) => {
            if (usedNewIndexes.has(idx)) return;

            const row = sheet.addRow([
                "", newFact?.concept || "",
                "", newFact?.label || "",
                "", newFact?.value || "",
                "", newFact?.contextRef ? newPeriod[newFact.contextRef] : "",
                "", newFact?.unitRef ? newUnit[newFact.unitRef] : "",
                "", newFact?.scale || "",
                "", newFact?.inlineSentence || ""
            ]);

            // Color only new cells green
            for (let col = 2; col <= row.cellCount; col += 2) {
                const cell = row.getCell(col);
                if (cell.value) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB6D7A8' } };
                }
            }
        });

        // Auto-width columns
        sheet.columns.forEach(col => {
            let maxLength = 15;
            col.eachCell({ includeEmpty: true }, cell => {
                const len = cell.value ? cell.value.toString().length : 0;
                if (len > maxLength) maxLength = len;
            });
            col.width = maxLength + 5;
        });
    }

    // Save workbook
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "XBRL_Comparison.xlsx";
    a.click();
    URL.revokeObjectURL(url);
}