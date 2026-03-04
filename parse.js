const oldRoleDefMap = {};
const newRoleDefMap = {};

async function parseXsdRoles(zipEntry, fileType) {

    const xmlDoc = new DOMParser().parseFromString(await zipEntry.async("text"), "application/xml");

    const roleTypes = xmlDoc.querySelectorAll("link\\:roleType, roleType");

    roleTypes.forEach(roleType => {

        const roleURI = roleType.getAttribute("roleURI");
        const definition = roleType.querySelector("link\\:definition, definition");

        if (!roleURI || !definition) return;

        const xsdRoleName = definition.textContent.trim();
        const roleName = xsdRoleName.replace(/^\d+\s*-\s*\w+\s*-\s*/, '');

        if (fileType === "OLDZIP") {
            oldRoleDefMap[roleURI] = properRoleName(roleName);
        } else {
            newRoleDefMap[roleURI] = properRoleName(roleName);
        }
    });
}


const oldFacts = [];
const newFacts = [];

async function parseIxbrlFacts(zipEntry, fileName) {
    const xmlDoc = new DOMParser().parseFromString(await zipEntry.async("text"), "application/xml");

    if (fileName === "OLDZIP") {
        Object.assign(oldPeriod, PeriodList(xmlDoc));
        Object.assign(oldUnit, UnitList(xmlDoc));
    } else {
        Object.assign(newPeriod, PeriodList(xmlDoc));
        Object.assign(newUnit, UnitList(xmlDoc));
    }

    const ixFacts = xmlDoc.querySelectorAll("nonFraction, nonNumeric");

    ixFacts.forEach(fact => {
        const contextRef = fact.getAttribute("contextRef");
        const unitRef = fact.getAttribute("unitRef");
        const scale = fact.getAttribute("scale");
        const concept = fact.getAttribute("name");
        const value = fact.textContent.trim();
        const parentText = fact.parentNode?.textContent.trim() || value;

        let axisMembers = [];

        if (contextRef) {
            const contextNode = xmlDoc.querySelector(`context[id="${contextRef}"]`);

            if (contextNode) {
                const members = contextNode.querySelectorAll("explicitMember");

                members.forEach(m => {
                    const axis = m.getAttribute("dimension");
                    const member = m.textContent.trim();

                    if (!axis || !member) return;

                    axisMembers.push({ axis, member });
                });
            }
        }

        const factObj = { concept, value, contextRef, unitRef, scale, axisMembers, inlineSentence: parentText };

        fileName === "OLDZIP" ? oldFacts.push(factObj) : newFacts.push(factObj);
    });
}

const oldLabelMap = {};
const newLabelMap = {};

async function parseLabelLinkbase(zipEntry, type) {
    const xml = await zipEntry.async("text");
    const doc = new DOMParser().parseFromString(xml, "application/xml");

    const conceptMap = {};
    const labelRefs = {};

    doc.querySelectorAll("link\\:loc, loc").forEach(loc => {
        const label = loc.getAttribute("xlink:label");
        const href = loc.getAttribute("xlink:href");

        if (label && href) {
            labelRefs[label] = href.split("#")[1];
        }
    });

    doc.querySelectorAll("link\\:label, label").forEach(label => {
        const id = label.getAttribute("xlink:label");
        const role = label.getAttribute("xlink:role");
        if (!id || !role) return;

        if (!conceptMap[id]) conceptMap[id] = {};
        conceptMap[id][role] = label.textContent.trim();
    });

    const finalMap = {};
    doc.querySelectorAll("link\\:labelArc, labelArc").forEach(arc => {
        const concept = labelRefs[arc.getAttribute("xlink:from")];
        const labelData = conceptMap[arc.getAttribute("xlink:to")];

        if (concept && labelData) {
            finalMap[concept] = labelData;
        }
    });

    Object.assign(type === "OLDZIP" ? oldLabelMap : newLabelMap, finalMap);
}


const oldPresentationRoles = [];
const newPresentationRoles = [];

async function presentationRoles(zipEntry, type) {
    const doc = new DOMParser()
        .parseFromString(await zipEntry.async("text"), "application/xml");

    const isOld = type === "OLDZIP";
    const roleDefMap = isOld ? oldRoleDefMap : newRoleDefMap;
    const roleConceptMap = isOld ? oldRoleConceptMap : newRoleConceptMap;
    const presentationRoles = isOld ? oldPresentationRoles : newPresentationRoles;

    const roleRefMap = {};
    const roleOrder = [];

    doc.querySelectorAll("link\\:roleRef, roleRef").forEach(ref => {
        const uri = ref.getAttribute("roleURI");
        const name = uri && roleDefMap[uri];
        if (name) {
            roleRefMap[uri] = name;
            roleOrder.push(name);
        }
    });

    doc.querySelectorAll("link\\:presentationLink, presentationLink").forEach(link => {
        const roleName = roleRefMap[link.getAttribute("xlink:role")];
        if (!roleName) return;

        const labelMap = {};
        const parentMap = {};
        const children = new Set();

        link.querySelectorAll("link\\:loc, loc").forEach(loc => {
            const l = loc.getAttribute("xlink:label");
            const h = loc.getAttribute("xlink:href");
            if (l && h) labelMap[l] = h.split("#")[1];
        });

        link.querySelectorAll("link\\:presentationArc, presentationArc").forEach(arc => {
            const from = labelMap[arc.getAttribute("xlink:from")];
            const to = labelMap[arc.getAttribute("xlink:to")];
            if (!from || !to) return;

            const order = parseFloat(arc.getAttribute("order")) || 0;
            const preferred = arc.getAttribute("preferredLabel") || arc.getAttribute("xlink:preferredLabel");

            (parentMap[from] ||= []).push({ concept: to, order, preferred });
            children.add(to);
        });

        Object.values(parentMap).forEach(arr => arr.sort((a, b) => a.order - b.order));

        const flatList = [];
        function walk(concept, preferred = null) {
            flatList.push({ concept, preferredLabel: preferred });
            parentMap[concept]?.forEach(child => walk(child.concept, child.preferred));
        }

        Object.keys(parentMap).filter(p => !children.has(p)).forEach(root => walk(root));

        roleConceptMap[roleName] = flatList;
    });

    roleOrder.forEach(role => {
        presentationRoles.push(role);
        roleConceptMap[role] ||= [];
    });
}


const oldAxisMemberMap = {};
const newAxisMemberMap = {};

async function parseDefinitionLinkbase(zipEntry, type) {
    const doc = new DOMParser().parseFromString(await zipEntry.async("text"), "application/xml");

    const targetMap = type === "OLDZIP" ? oldAxisMemberMap : newAxisMemberMap;

    const stripPrefix = s => s.includes(":") ? s.split(":")[1] : s;

    doc.querySelectorAll("link\\:definitionLink, definitionLink").forEach(link => {
        const locs = link.querySelectorAll("link\\:loc, loc");
        const arcs = link.querySelectorAll("link\\:definitionArc, definitionArc");

        const labelToConcept = {};
        locs.forEach(loc => {
            const label = loc.getAttribute("xlink:label");
            const href = loc.getAttribute("xlink:href");
            if (label && href) labelToConcept[label] = stripPrefix(href.split("#")[1]);
        });

        arcs.forEach(arc => {
            const arcrole = arc.getAttribute("xlink:arcrole");
            if (!arcrole?.endsWith("domain-member")) return;

            const parent = labelToConcept[arc.getAttribute("xlink:from")];
            const child = labelToConcept[arc.getAttribute("xlink:to")];
            if (!parent || !child) return;

            (targetMap[parent] ||= []).push(child);
        });
    });
}

const oldPeriod = {};
const newPeriod = {};
const oldUnit = {};
const newUnit = {};

function PeriodList(xmlDoc) {
    const contextMap = {};
    const contexts = xmlDoc.querySelectorAll("xbrli\\:context, context");

    contexts.forEach(ctx => {
        const id = ctx.getAttribute("id");
        if (!id) return;

        const instant = ctx.querySelector("xbrli\\:instant, instant")?.textContent.trim();
        const start = ctx.querySelector("xbrli\\:startDate, startDate")?.textContent.trim();
        const end = ctx.querySelector("xbrli\\:endDate, endDate")?.textContent.trim();

        if (instant) contextMap[id] = instant;
        else if (start && end) contextMap[id] = `${start} to ${end}`;
    });

    return contextMap;
}

function UnitList(xmlDoc) {
    const unitMap = {};
    const units = xmlDoc.querySelectorAll("xbrli\\:unit, unit");

    units.forEach(unit => {
        const id = unit.getAttribute("id");
        if (!id) return;

        const measure = unit.querySelector("xbrli\\:measure, measure")?.textContent.trim();
        if (measure) unitMap[id] = measure.split(":").pop();
    });

    return unitMap;
}

function getPreferredLabel({ concept, preferredLabel }, fileType) {
    const labelMap = fileType === "OLDZIP" ? oldLabelMap : newLabelMap;
    const conceptLabels = labelMap[concept];
    if (!conceptLabels) return "-";

    if (preferredLabel?.trim() && conceptLabels[preferredLabel.trim()]) {
        return conceptLabels[preferredLabel.trim()];
    }

    const standardRole = "http://www.xbrl.org/2003/role/label";
    return conceptLabels[standardRole] || Object.values(conceptLabels)[0] || "-";
}