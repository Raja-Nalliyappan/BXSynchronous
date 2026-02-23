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
        } else if (zipEntry.name.toLowerCase().endsWith(".htm")) {
            await parseIxbrlFacts(zipEntry, "OLDZIP");
        }
    }

    for (const zipEntry of newZipFile) {
        if (zipEntry.name.toLowerCase().endsWith("_pre.xml")) {
            await presentationRoles(zipEntry, "NEWZIP");
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

        let roleName = roleURI.split('/').pop();
        roleName = roleName.replace(/([A-Z])/g, ' $1').trim();

        roleRefMap[roleURI] = roleName;
        roleOrder.push(roleName);
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

            parentChildMap[parent].push({ concept: child, order });
            childSet.add(child);
        }

        for (const parent in parentChildMap) {
            parentChildMap[parent].sort((a, b) => a.order - b.order);
        }

        const flatList = [];

        function flatten(parent) {
            flatList.push(parent);

            if (parentChildMap[parent]) {
                for (const childObj of parentChildMap[parent]) {
                    flatten(childObj.concept);
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

    // Create union of all concepts
    const allConcepts = new Set([
        ...oldData.map(f => f.concept),
        ...newData.map(f => f.concept)
    ]);

    allConcepts.forEach(concept => {

        const tr = document.createElement("tr");

        const oldFact = oldData.find(f => f.concept === concept);
        const newFact = newData.find(f => f.concept === concept);

        // Old Concept
        const oldConceptTd = document.createElement("td");
        const oldConcept = oldFact?.concept || "-";
        oldConceptTd.textContent = oldConcept;
        oldConceptTd.title = oldConcept;

        // New Concept
        const newConceptTd = document.createElement("td");
        const newConcept = newFact?.concept || "-";
        newConceptTd.textContent = newConcept;
        newConceptTd.title = newConcept;

        // Old Label
        const oldLabelTd = document.createElement("td");
        const oldLabel = oldFact?.label || "-";
        oldLabelTd.textContent = oldLabel;
        oldLabelTd.title = oldLabel;

        // New Label
        const newLabelTd = document.createElement("td");
        const newLabel = newFact?.label || "-";
        newLabelTd.textContent = newLabel;
        newLabelTd.title = newLabel;

        // Old Value
        const oldValueTd = document.createElement("td");
        const oldValue = oldFact?.value || "-";
        oldValueTd.textContent = oldValue;
        oldValueTd.title = oldValue;

        // New Value
        const newValueTd = document.createElement("td");
        const newValue = newFact?.value || "-";
        newValueTd.textContent = newValue;
        newValueTd.title = newValue;

        // Old Period
        const oldDateTd = document.createElement("td");
        const oldCtx = oldFact?.contextRef ? oldPeriod[oldFact.contextRef] : "-";
        oldDateTd.textContent = oldCtx || "-";
        oldDateTd.title = oldCtx;

        // New Period
        const newDateTd = document.createElement("td");
        const newCtx = newFact?.contextRef ? newPeriod[newFact.contextRef] : "-";
        newDateTd.textContent = newCtx || "-";
        newDateTd.title = newCtx;

        // Old Unit
        const oldUnitTd = document.createElement("td");
        const oldUnitValue = oldFact?.unitRef ? oldUnit[oldFact.unitRef] : "-";
        oldUnitTd.textContent = oldUnitValue || "-";

        // New Unit
        const newUnitTd = document.createElement("td");
        const newUnitValue = newFact?.unitRef ? newUnit[newFact.unitRef] : "-";
        newUnitTd.textContent = newUnitValue || "-";

        // Old Scale
        const oldScaleTd = document.createElement("td");
        const oldScale = oldFact?.scale || "-";
        oldScaleTd.textContent = oldScale || "-";

        // New Scale
        const newScaleTd = document.createElement("td");
        const onewScale = newFact?.scale || "-";
        newScaleTd.textContent = onewScale || "-";

        // Old Text Content
        const oldSourceContentId = document.createElement("td");
        const oldSourceContent = oldFact?.inlineSentence || "-";
        oldSourceContentId.textContent = oldSourceContent || "-";
        oldSourceContentId.title = oldSourceContent;

        // New Text Content
        const newSourceContentId = document.createElement("td");
        const onewSourceContent = newFact?.inlineSentence || "-";
        newSourceContentId.textContent = onewSourceContent || "-";
        newSourceContentId.title = onewSourceContent;

        tr.appendChild(oldConceptTd);
        tr.appendChild(newConceptTd);
        tr.appendChild(oldLabelTd);
        tr.appendChild(newLabelTd);
        tr.appendChild(oldValueTd);
        tr.appendChild(newValueTd);
        tr.appendChild(oldDateTd);
        tr.appendChild(newDateTd);
        tr.appendChild(oldUnitTd);
        tr.appendChild(newUnitTd);
        tr.appendChild(oldScaleTd);
        tr.appendChild(newScaleTd);
        tr.appendChild(oldSourceContentId);
        tr.appendChild(newSourceContentId);

        tbody.appendChild(tr);
    });
}


document.querySelector(".presentationRole").addEventListener("click", function (e) {

    if (!e.target.classList.contains("role-btn")) return;

    const roleName = e.target.textContent.trim();
    filterFactsByRole(roleName);
});


function filterFactsByRole(roleName) {

    const oldConcepts = oldRoleConceptMap[roleName] || [];
    const newConcepts = newRoleConceptMap[roleName] || [];

    const normalize = (str) =>
        str?.toLowerCase().replace(":", "_").trim();

    const orderedOld = [];
    const orderedNew = [];

    oldConcepts.forEach(concept => {
        const fact = oldFacts.find(f =>
            normalize(f.concept) === normalize(concept)
        );

        orderedOld.push(fact || { concept: concept });
    });

    newConcepts.forEach(concept => {
        const fact = newFacts.find(f =>
            normalize(f.concept) === normalize(concept)
        );

        orderedNew.push(fact || { concept: concept });
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


function presentationRoleCompare() {

    const addedRoles = newPresentationRoles.filter(role => !oldPresentationRoles.includes(role));
    const removedRoles = oldPresentationRoles.filter(role => !newPresentationRoles.includes(role));

    let presentationRole = document.getElementsByClassName("presentationRole")[0];
    presentationRole.innerHTML = "";

    newPresentationRoles.forEach(role => {
        let roleBtn = document.createElement("button");
        roleBtn.textContent = role;
        roleBtn.className = "role-btn";
        presentationRole.appendChild(roleBtn);
    });

    if (removedRoles.length > 0) {
        let removeHeading = document.createElement("h4");
        removeHeading.textContent = "Remove List";
        presentationRole.appendChild(removeHeading);

        removedRoles.forEach(role => {
            let p = document.createElement("button");
            p.textContent = role;
            p.className = "role-btn";
            presentationRole.appendChild(p);
        });
    }

    if (addedRoles.length > 0) {
        let addedHeading = document.createElement("h4");
        addedHeading.textContent = "Added List";
        presentationRole.appendChild(addedHeading);

        addedRoles.forEach(role => {
            let p = document.createElement("button");
            p.textContent = role;
            p.className = "role-btn";
            presentationRole.appendChild(p);
        });
    }

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


// const oldScale = {};
// const newScale = {};

// function ScaleList(xmlDoc){

//     const scaleMao = {};
//     const scale = xmlDoc.querySelectorAll("");
// }