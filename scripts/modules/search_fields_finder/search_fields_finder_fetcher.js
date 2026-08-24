(() => {
    "use strict";

    let SETTINGS, searchType, recType;
    let initializeFieldFinder;
    let handleFieldUpdate;
    let FieldFinderDropdown;
    let DropdownOption;

    const FieldType = {
        RELATED: "Related Fields",
        CUSTOM: "Custom Field",
        CUSTOM_BODY: "Custom Body",
        CUSTOM_COLUMN: "Custom Column",
        STANDARD: "",
        FORMULA: "Formula Field"
    };

    const MACHINE_NAMES = ["returnfields", "filterfields", "detailfields"];

    const DROPDOWN_NAMES = ["rffield", "filterfilter", "sort1", "sort2", "sort3", "field", "dffield", "fffilter"];

    const _schemaCache = new Map();

    function ffEscapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
    }

    function ffWords(query) {
        return String(query == null ? '' : query).toLowerCase().split(/\s+/).filter(Boolean);
    }

    function ffWordPositions(text, word) {
        const t = String(text == null ? '' : text).toLowerCase();
        const w = String(word || '');
        if (!w) return [];

        const pos = [];
        let from = 0;
        let idx = t.indexOf(w, from);
        while (idx !== -1) {
            for (let i = 0; i < w.length; i++) pos.push(idx + i);
            from = idx + w.length;
            idx = t.indexOf(w, from);
        }
        return pos.length ? pos : null;
    }

    function ffHighlight(text, positions) {
        const original = String(text == null ? '' : text);
        if (!positions || !positions.length) return ffEscapeHtml(original);
        const set = new Set(positions);
        let out = '';
        for (let i = 0; i < original.length; i++) {
            const ch = ffEscapeHtml(original[i]);
            out += set.has(i) ? `<mark class="nsft-ff-mark">${ch}</mark>` : ch;
        }
        return out;
    }


    let _inModalFrame = null;
    function inModalFrame() {
        if (_inModalFrame !== null) return _inModalFrame;
        try {
            if (typeof NS !== 'undefined' && NS.Core && typeof NS.Core.getURLParameter === 'function') {
                _inModalFrame = !!NS.Core.getURLParameter("ifrmcntnr");
            } else {
                _inModalFrame = /[?&]ifrmcntnr=/i.test(location.search) || window.self !== window.top;
            }
        } catch (e) {
            _inModalFrame = false;
        }
        return _inModalFrame;
    }

    initializeFieldFinder = function () {
        try {
            const settingsEl = document.getElementById("nsft-field-finder-settings");
            if (!settingsEl) return;
            SETTINGS = JSON.parse(settingsEl.getAttribute("data-options") || "{}");
        } catch (e) {
            console.error(SETTINGS?.i18n?.settings_error || "Could not parse Field Finder settings.");
            return;
        }

        if (SETTINGS.enabled) {
            if (typeof NS === 'undefined') return;

            if (SETTINGS.features.multiSelect) {
                if (NS.Core && NS.Core.getURLParameter) {
                    SETTINGS.features.multiSelect = !NS.Core.getURLParameter("ifrmcntnr");
                }
            }

            if (SETTINGS.features.multiSelect && typeof machines !== 'undefined') {
                for (const machineName in machines) {
                    if (MACHINE_NAMES.includes(machineName)) {
                        let machine = machines[machineName];
                        if (!machine.hasFieldFinderListener) {
                            if (machine.postBuildTableListeners) {
                                machine.postBuildTableListeners.push(() => handleFieldUpdate(machine));
                            }
                            machine.hasFieldFinderListener = true;
                            if (machine.buildtable) machine.buildtable();
                        }
                    }
                }
            }

            const searchTypeEl = document.getElementById("searchtype");
            searchType = (searchTypeEl ? searchTypeEl.value : null) || (NS.Core ? NS.Core.getURLParameter("searchtype") : null);

            const recTypeEl = document.getElementById("rectype");
            recType = (recTypeEl ? recTypeEl.value : null) || (NS.Core ? NS.Core.getURLParameter("rectype") : -1);

            if (typeof dropdowns !== 'undefined') {
                for (let ddName in dropdowns) {
                    if (DROPDOWN_NAMES.includes(dropdowns[ddName].name)) {
                        if (!dropdowns[ddName].fieldFinder) {
                            dropdowns[ddName].fieldFinder = new FieldFinderDropdown(dropdowns[ddName], searchType, recType, SETTINGS);
                        }
                    }
                }
            }
        }
    };

    handleFieldUpdate = function (machine) {
    };


    FieldFinderDropdown = class {
        constructor(nsDropdown, searchType, recType, settings) {
            this.fieldsTotal = 0;
            this.fieldsDisplayed = 0;
            this.multiSelect = false;
            this.fieldTypeStatus = {
                standardFields: false,
                relatedTableFields: false,
                customFields: false,
                formulaFields: false,
                emptyTypeFields: false
            };
            this.searchInputField = document.createElement("input");
            this.fieldFinderElement = document.createElement("div");

            this.dataTypeFilter = null;



            this.relatedTablesAdded = [];
            this.options = [];
            this.selectedOptions = [];
            this.customOptions = [];
            this.standardOptions = [];
            this.relatedOptions = [];
            this.formulaOptions = [];
            this.hasRelatedTableFields = false;
            this.hasCustomFields = false;
            this.hasFormulaFields = false;
            this.hasDataTypes = false;
            this.buttons = {};
            this.hasMachine = false;

            this.nsDropdown = nsDropdown;
            this.settings = settings;
            this.searchType = searchType;
            this.recType = recType;

            this.init();
        }


        handlePluginClick(e) {
            if (inModalFrame() && this.isOptionEvent(e)) return;

            e.stopPropagation();

            if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;

            const isScrollbar = (e.target === this.nsDropdown.div) &&
                (e.offsetX > this.nsDropdown.div.clientWidth || e.offsetY > this.nsDropdown.div.clientHeight);

            if (isScrollbar) return;

            if (e.type === "mousedown") {
                e.preventDefault();
            }
        }

        init() {
            if (this.nsDropdown.hddn && this.nsDropdown.hddn.machine && MACHINE_NAMES.includes(this.nsDropdown.hddn.machine.name)) {
                this.hasMachine = true;
            }

            if (!this.nsDropdown.div) this.nsDropdown.buildDiv();

            const handler = (e) => this.handlePluginClick(e);

            this.nsDropdown.div.addEventListener("mousedown", handler);
            this.nsDropdown.div.addEventListener("click", (e) => {
                if (inModalFrame() && this.isOptionEvent(e)) return;
                e.stopPropagation();
            });
            this.nsDropdown.div.addEventListener("pointerdown", handler);

            this.setDropdownWidth();
            this.enableMultiSelectIfAvailable();
            this.configureFieldClickHandler();
            this.prepareDropdownOptions();
            this.addFieldFinderFilterElements();

            this.configureAutoFocusOnTextBox();
            this.setupVisibilityObserver();

            this.nsDropdown.div.fieldFinderLoaded = true;
        }

        enableMultiSelectIfAvailable() {
            if (this.hasMachine) this.multiSelect = true;
        }

        handleTextInput() {
            this.filterDropdown();
        }

        getTextWidth(text, font) {
            const canvas = this.getTextWidth.canvas || (this.getTextWidth.canvas = document.createElement("canvas"));
            const context = canvas.getContext("2d");
            context.font = font;
            const metrics = context.measureText(text);
            return metrics.width;
        }

        prepareDropdownOptions() {
            this.options = [];
            this.hasDataTypes = false;

            let maxNameW = 200;
            let maxIdW = 100;
            let maxTypeW = 50;
            const font = "12px Inter, -apple-system, system-ui, sans-serif";

            this.nsDropdown.valueArray.forEach((val, index) => {
                let name = this.nsDropdown.textArray[index].replace(/\s*\(.*?\)/g, "").trim();
                let nw = this.getTextWidth(name, font);
                if (nw > maxNameW) maxNameW = nw;

                let id = val;
                const prefixes = ["stdentity", "stdbody", "custom_", "transaction_"];
                if (this.searchType) prefixes.push(`${this.searchType.toLowerCase()}_`);
                const re = new RegExp(`(${prefixes.join("|")})`);
                let prettyId = id.toLowerCase().replace(re, "");

                let iw = this.getTextWidth(prettyId, font) + 40;
                if (iw > maxIdW) maxIdW = iw;

                let typeText = this.dataTypeFor(val);
                if (typeText) this.hasDataTypes = true;
                let tw = this.getTextWidth(typeText, font) + 20;
                if (tw > maxTypeW) maxTypeW = tw;
            });

            this.colWidths = {
                name: Math.ceil(maxNameW) + 20,
                id: Math.ceil(maxIdW) + 10,
                type: Math.ceil(maxTypeW) + 10
            };

            this.fitColumnsToViewport();

            this.nsDropdown.valueArray.forEach((val, index) => {
                let option = new DropdownOption(this, index);
                this.options.push(option);

                if (option.fieldType === FieldType.CUSTOM || option.fieldType === FieldType.CUSTOM_BODY || option.fieldType === FieldType.CUSTOM_COLUMN) {
                    this.customOptions.push(option);
                    this.hasCustomFields = true;
                } else if (option.fieldType === FieldType.RELATED) {
                    this.relatedOptions.push(option);
                    this.hasRelatedTableFields = true;
                } else if (option.fieldType === FieldType.FORMULA) {
                    this.formulaOptions.push(option);
                    this.hasFormulaFields = true;
                } else {
                    this.standardOptions.push(option);
                }
            });

            this.setDropdownWidth();
        }

        softReload() {
            this.setDropdownWidth();
            this.prepareDropdownOptions();

            if (this.nsDropdown.div.childNodes.length > 0) {
                this.nsDropdown.div.insertBefore(this.fieldFinderElement, this.nsDropdown.div.childNodes[0]);
            } else {
                this.nsDropdown.div.appendChild(this.fieldFinderElement);
            }



            this.nsDropdown.div.fieldFinderLoaded = true;
            setTimeout(() => {
                this.nsDropdown.div.scrollTop = 0;
            }, 10);
        }

        configureFieldClickHandler() {
            const self = this;
            const handleClick = () => {
                if (!self.nsDropdown.div.fieldFinderLoaded) self.softReload();
                if (!self.nsDropdown.getIndex()) self.reset();
                self.setFocusOnTextBox();
            };

            if (this.nsDropdown.inpt) this.nsDropdown.inpt.addEventListener("click", handleClick);
            const arrow = document.getElementById(`${this.nsDropdown.inpt.id}_arrow`);
            if (arrow) arrow.addEventListener("click", handleClick);
        }

        createFilterButton(id, text) {
            const btn = document.createElement("button");
            btn.setAttribute("onpointerdown", "event.preventDefault();");
            btn.setAttribute("id", id);
            btn.setAttribute("type", "button");
            btn.setAttribute("value", "0");
            btn.innerText = text;
            btn.addEventListener("click", () => this.toggleFieldTypeFilter(btn));
            return btn;
        }

        toggleFieldTypeFilter(btn) {
            const enabled = btn.classList.toggle("nsft-ff-btn-enabled");
            const id = btn.id;
            this.fieldTypeStatus[id] = enabled;
            this.nsDropdown.respondToArrow(0 - this.nsDropdown.indexOnDeck);
            this.setFocusOnTextBox();
            this.filterDropdown();
        }

        setFocusOnTextBox() {
            if (!this.searchInputField) return;

            this.searchInputField.focus();

            if (this._focusInterval) return;

            let attempts = 0;
            const maxAttempts = 40;

            this._focusInterval = setInterval(() => {
                attempts++;

                if (this.nsDropdown.div.style.display === 'none') {
                    clearInterval(this._focusInterval);
                    this._focusInterval = null;
                    return;
                }

                if (document.activeElement !== this.searchInputField) {
                    this.searchInputField.focus();
                }

                if (attempts >= maxAttempts) {
                    clearInterval(this._focusInterval);
                    this._focusInterval = null;
                }
            }, 50);
        }

        setupVisibilityObserver() {
            if (!this.nsDropdown || !this.nsDropdown.div) return;

            let wasVisible = false;

            const observer = new MutationObserver((mutations) => {
                let checkVisibility = false;
                for (const mutation of mutations) {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                        checkVisibility = true;
                        break;
                    }
                }

                if (checkVisibility) {
                    const style = this.nsDropdown.div.style;
                    const isVisible = style.display !== 'none' && style.visibility !== 'hidden';

                    if (isVisible && !wasVisible) {
                        this.setFocusOnTextBox();
                    }
                    wasVisible = isVisible;
                }
            });

            observer.observe(this.nsDropdown.div, { attributes: true, attributeFilter: ['style'] });
        }

        configureAutoFocusOnTextBox() {
            this.nsDropdown.inpt.addEventListener("focus", () => this.setFocusOnTextBox());
        }

        isOptionEvent(e) {
            const t = e && e.target;
            return !!(t && typeof t.closest === 'function' && t.closest("[data-nsft-ff-row]"));
        }

        dataTypeFor(fieldId) {
            const ddName = this.nsDropdown.name;
            const ff = (typeof ffTypes === 'object' && ffTypes) ? ffTypes : null;
            const rf = (typeof rfTypes === 'object' && rfTypes) ? rfTypes : null;

            if ((ddName == "fffilter" || ddName == "filterfilter") && ff) {
                if (ff[fieldId]) return ff[fieldId];
            } else if (ddName == "rffield" && rf) {
                if (rf[fieldId]) return rf[fieldId];
            }
            return (ff && ff[fieldId]) || (rf && rf[fieldId]) || "";
        }

        availableWidth() {
            try {
                const doc = this.nsDropdown.div && this.nsDropdown.div.ownerDocument;
                if (!doc) return 0;
                const el = doc.documentElement;
                return (el && el.clientWidth) || (doc.body && doc.body.clientWidth) || 0;
            } catch (e) {
                return 0;
            }
        }

        fitColumnsToViewport() {
            if (!this.colWidths) return;

            const MARGIN = 48;
            const NAME_MIN = 140;
            const avail = this.availableWidth() - MARGIN;
            if (avail <= 0) return;

            let needed = this.colWidths.name;
            if (this.settings.attributes.fieldId) needed += this.colWidths.id;
            if (this.settings.attributes.dataType) needed += this.colWidths.type;
            needed += 40;

            const excess = needed - avail;
            if (excess <= 0) return;

            this.colWidths.name = Math.max(NAME_MIN, this.colWidths.name - excess);
        }

        setDropdownWidth() {
            let width = 800;

            if (this.colWidths) {
                width = this.colWidths.name;
                if (this.settings.attributes.fieldId) width += this.colWidths.id;
                if (this.settings.attributes.dataType) width += this.colWidths.type;
                width += 40;
            } else {
                if (!this.settings.attributes.dataType) width -= 80;
                if (!this.settings.attributes.fieldType) width -= 112;
                if (!this.settings.attributes.fieldId) width -= 280;
            }

            if (width < 450) width = 450;

            const avail = this.availableWidth();
            if (avail > 0) {
                const maxW = avail - 24;
                if (maxW > 0 && width > maxW) width = Math.max(280, maxW);
            }

            const style = this.nsDropdown.div.style;
            style.setProperty("width", `${width}px`);
            style.setProperty("height", "300px", "important");
            style.setProperty("max-height", "80vh", "important");
            style.setProperty("min-height", "300px", "important");
            style.setProperty("margin-bottom", "0px");
            style.setProperty("background-color", "#ffffff");
            style.setProperty("border-radius", "8px");
            style.setProperty("box-shadow", "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)");
            style.setProperty("border", "1px solid #e5e7eb");

            style.setProperty("position", "relative");
            style.setProperty("overflow-y", "auto");
            style.setProperty("overflow-x", "hidden");
            style.setProperty("box-sizing", "border-box");

            style.setProperty("padding-top", "0px");
            style.setProperty("padding-bottom", "0px");
            style.setProperty("padding-left", "0px");
            style.setProperty("padding-right", "0px");

            style.setProperty("font-family", "Inter, -apple-system, system-ui, sans-serif");
        }

        addButtons() {
            const group = document.createElement("div");
            group.setAttribute("class", "nsft-ff-btn-group");
            group.setAttribute("id", "nsft-ff-btn-group");

            this.buttons.standard = group.appendChild(this.createFilterButton("standardFields", this.settings.i18n.btn_standard));
            if (this.hasCustomFields) {
                this.buttons.custom = group.appendChild(this.createFilterButton("customFields", this.settings.i18n.btn_custom));
            }
            if (this.hasRelatedTableFields) {
                this.buttons.related = group.appendChild(this.createFilterButton("relatedTableFields", this.settings.i18n.btn_related));
            }
            if (this.hasFormulaFields) {
                this.buttons.formula = group.appendChild(this.createFilterButton("formulaFields", this.settings.i18n.btn_formula));
            }

            if (this.hasDataTypes) {
                this.buttons.empty = group.appendChild(this.createFilterButton("emptyTypeFields", this.settings.i18n.btn_empty_type));
            }

            if (this.settings.attributes.dataType && this.hasDataTypes) {
                this.dataTypeFilterValue = "";

                const container = document.createElement("div");
                container.classList.add("nsft-ff-datatype-container");

                const btn = document.createElement("button");
                btn.classList.add("nsft-ff-datatype-select");
                btn.style.backgroundImage = "none";
                btn.style.display = "flex";
                btn.style.alignItems = "center";
                btn.style.justifyContent = "center";
                btn.style.padding = "0 8px";
                btn.style.position = "relative";

                const labelSpan = document.createElement("span");
                labelSpan.textContent = this.settings.i18n.type_all;
                labelSpan.style.flex = "1";
                labelSpan.style.textAlign = "center";
                this.dataTypeLabel = labelSpan;
                btn.appendChild(labelSpan);

                const arrowSpan = document.createElement("span");
                arrowSpan.innerHTML = "&#9660;";
                arrowSpan.style.fontSize = "9px";
                arrowSpan.style.opacity = "0.5";
                arrowSpan.style.marginLeft = "4px";
                arrowSpan.style.flexShrink = "0";
                btn.appendChild(arrowSpan);

                const list = document.createElement("div");
                list.classList.add("nsft-ff-datatype-list");
                list.style.display = "none";
                list.style.position = "fixed";
                list.style.backgroundColor = "#fff";
                list.style.border = "1px solid #eee";
                list.style.borderRadius = "6px";
                list.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
                list.style.zIndex = "9999999";
                list.style.maxHeight = "250px";
                list.style.overflowY = "auto";
                list.style.minWidth = "140px";
                list.style.marginTop = "4px";

                const types = [
                    "CHECKBOX", "CLOBTEXT", "CURRENCY", "DATE", "DATETIME", "DATETIMETZ",
                    "FLOAT", "HELP", "INTEGER", "MULTISELECT", "PERCENT", "PERIOD",
                    "PHONE", "RICHTEXT", "SELECT", "TEXT", "TEXTAREA", "URL"
                ];

                const addItem = (text, value) => {
                    const item = document.createElement("div");
                    item.textContent = text;
                    item.style.padding = "8px 12px";
                    item.style.fontSize = "11px";
                    item.style.color = "#333";
                    item.style.cursor = "pointer";
                    item.style.borderBottom = "1px solid #f9f9f9";
                    item.style.whiteSpace = "nowrap";

                    item.addEventListener("mouseenter", () => item.style.backgroundColor = "#f5f5f5");
                    item.addEventListener("mouseleave", () => item.style.backgroundColor = "#fff");

                    item.addEventListener("click", (e) => {
                        e.stopPropagation();
                        this.dataTypeFilterValue = value;
                        labelSpan.textContent = value ? `${this.settings.i18n.type_prefix}${text}` : text;
                        list.style.display = "none";
                        this.filterDropdown();
                    });

                    item.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
                    item.addEventListener("mouseup", (e) => e.stopPropagation());
                    item.addEventListener("pointerdown", (e) => { e.stopPropagation(); });
                    list.appendChild(item);
                };

                addItem(this.settings.i18n.type_all, "");
                types.forEach(t => {
                    const display = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
                    addItem(display, t);
                });

                btn.addEventListener("click", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const isHidden = list.style.display === "none";
                    if (isHidden) {
                        const rect = btn.getBoundingClientRect();
                        list.style.top = (rect.bottom + 2) + "px";
                        list.style.right = (window.innerWidth - rect.right) + "px";
                        list.style.left = "auto";
                        list.style.display = "block";
                    } else {
                        list.style.display = "none";
                    }
                });

                btn.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
                btn.addEventListener("mouseup", (e) => e.stopPropagation());
                btn.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); });


                container.appendChild(btn);
                container.appendChild(list);

                container.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
                container.addEventListener("click", (e) => { e.stopPropagation(); });
                container.addEventListener("mouseup", (e) => { e.stopPropagation(); });
                container.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); });


                this.dataTypeFilter = container;
                group.appendChild(container);
            }

            this.fieldFinderElement.appendChild(group);
        }

        addTextBox() {
            this.searchInputField.classList.add("nsft-ff-textbox");
            this.searchInputField.setAttribute("placeholder", this.settings.i18n.placeholder);
            this.searchInputField.setAttribute("type", "text");
            this.searchInputField.setAttribute("id", "nsft-ff-show-search-input-" + Math.floor(Math.random() * 10000));
            this.searchInputField.setAttribute("onmouseup", "event.stopPropagation();this.focus();");
            this.searchInputField.setAttribute("ondblclick", "event.preventDefault();this.select();");
            this.searchInputField.setAttribute("onclick", "event.preventDefault();this.select()");
            this.searchInputField.setAttribute("autocomplete", "off");

            this.searchInputField.addEventListener("input", (e) => {
                e.stopPropagation();
                this.handleTextInput();
            });

            this.searchInputField.addEventListener("keydown", (e) => {
                e.stopPropagation();
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    this.handleArrowKey(e.key);
                } else if (e.key === "Enter" || e.key === "Tab") {
                    if (e.key === "Enter") e.preventDefault();
                    this.handleEnterOrTabKey();
                }
            });

            this.searchInputField.addEventListener("keyup", (e) => e.stopPropagation());
            this.searchInputField.addEventListener("keypress", (e) => e.stopPropagation());

            this.fieldFinderElement.appendChild(this.searchInputField);
        }

        addFieldFinderFilterElements() {
            this.fieldFinderElement.classList.add("nsft-ff-div");

            const handler = (e) => this.handlePluginClick(e);
            this.fieldFinderElement.addEventListener("click", (e) => e.stopPropagation());
            this.fieldFinderElement.addEventListener("mousedown", handler);
            this.fieldFinderElement.addEventListener("pointerdown", handler);

            this.addTextBox();
            this.addButtons();

            if (this.nsDropdown.div.childNodes.length > 0) {
                this.nsDropdown.div.insertBefore(this.fieldFinderElement, this.nsDropdown.div.childNodes[0]);
            } else {
                this.nsDropdown.div.appendChild(this.fieldFinderElement);
            }
        }


        selectField(fieldId) {
            const machine = this.nsDropdown.hddn ? this.nsDropdown.hddn.machine : null;
            if (!machine) return;

            const map = {
                detailfields: "dffield",
                returnfields: "rffield",
                filterfields: "field"
            };
            const machineName = machine.name;
            const fieldMapName = map[machineName];

            const lineNum = machine.dataManager.findFieldValueLineNum(fieldMapName, fieldId);

            if (lineNum == -1) {
                machine.clearline(true);
                machine.insertdata(fieldId, machine.currentRowNum);
            } else {
                machine.deleteline(lineNum, true);
            }
            machine.clearline();
            machine.buildtable();
        }



        reset() {
            this.searchInputField.value = "";
            this.dataTypeFilterValue = "";
            if (this.dataTypeLabel) {
                this.dataTypeLabel.textContent = this.settings.i18n.type_all;
            }

            if (this.buttons.custom) this.buttons.custom.classList.remove("nsft-ff-btn-enabled");
            if (this.buttons.related) this.buttons.related.classList.remove("nsft-ff-btn-enabled");
            if (this.buttons.standard) this.buttons.standard.classList.remove("nsft-ff-btn-enabled");
            if (this.buttons.formula) this.buttons.formula.classList.remove("nsft-ff-btn-enabled");
            if (this.buttons.empty) this.buttons.empty.classList.remove("nsft-ff-btn-enabled");

            this.fieldTypeStatus.customFields = false;
            this.fieldTypeStatus.relatedTableFields = false;
            this.fieldTypeStatus.standardFields = false;
            this.fieldTypeStatus.formulaFields = false;
            this.fieldTypeStatus.emptyTypeFields = false;

            this.filterDropdown();
        }

        filterDropdown() {
            this.fieldsDisplayed = 0;
            this.fieldsTotal = 0;

            const selectedDataType = (this.dataTypeFilterValue !== undefined) ? this.dataTypeFilterValue : "";

            this.options.forEach(opt => {
                this.fieldsTotal++;
                opt.filterOption();

                if (!opt.hidden && selectedDataType) {
                    const typeText = opt.dataTypeElement ? opt.dataTypeElement.textContent.trim() : "";

                    if (typeText !== selectedDataType) {
                        opt.hidden = true;
                        opt.element.style.setProperty("display", "none", "important");
                    }
                }

                if (!opt.hidden) this.fieldsDisplayed++;
            });

        }

        getSelectedFields() {
            if (this.nsDropdown.hddn && this.nsDropdown.hddn.machine && this.nsDropdown.hddn.machine.dataManager) {
                return this.nsDropdown.hddn.machine.dataManager.getLineArray().map(arr => arr[0]);
            }
            return [];
        }



        async addRelatedTableFields(joinId) {
            const machineName = (this.nsDropdown.hddn && this.nsDropdown.hddn.machine) ? this.nsDropdown.hddn.machine.name : this.nsDropdown.name;
            const uniqueKey = `${machineName}_${joinId}`;

            if (this.relatedTablesAdded.includes(uniqueKey)) return false;

            const index = this.nsDropdown.getIndexForValue(joinId);
            if (!index) return false;

            let details;
            try {
                details = await this.getRelatedTableDetails(joinId);
            } catch (err) {
                console.error(`${this.settings.i18n.error_generic}${err}`);
                return false;
            }

            this.nsDropdown.close();
            let safeIndex = parseInt(index) + 1;

            for (let f of details.fields) {
                if (f.value != "") {
                    this.nsDropdown.addOption(`${details.labelName} : ${f.text}`, f.value, safeIndex);
                    if (machineName == "returnfields" && typeof setRfType === 'function') {
                        setRfType(f.value, "");
                    }
                    safeIndex++;
                }
            }

            this.relatedTablesAdded.push(uniqueKey);
            this.nsDropdown.buildDiv();
            this.softReload();
            this.nsDropdown.open();
            this.nsDropdown.setCurrentCellInMenu(this.nsDropdown.divArray[parseInt(index)]);
            if (this.nsDropdown.currentCell) this.nsDropdown.currentCell.scrollIntoView(true);

            return true;
        }

        async getRelatedTableDetails(joinId) {
            const machineName = (this.nsDropdown.hddn && this.nsDropdown.hddn.machine) ? this.nsDropdown.hddn.machine.name : this.nsDropdown.name;
            const cleanJoinId = joinId.replace(/^\_/, "");

            const urlMap = {
                filters: `/app/common/search/search.nl?join=${cleanJoinId}&searchtype=${this.searchType}&ifrmcntnr=T&rectype=${this.recType}`,
                returnfields: `/app/common/search/search.nl?resultjoin=${cleanJoinId}&sel=returnfields&mach=returnfields&searchtype=${this.searchType}&ifrmcntnr=T&rectype=${this.recType}`,
                summaryfilters: `/app/common/search/search.nl?resultjoin=${cleanJoinId}&sel=filterfilter&mach=summaryfilters&searchtype=${this.searchType}&ifrmcntnr=T&rectype=${this.recType}`,
                field: `/app/common/search/search.nl?formulajoin=${cleanJoinId}&filterformula=T&field=formula&useids=F&searchtype=${this.searchType}&ifrmcntnr=T&rectype=${this.recType}`,
                detailfields: `/app/common/search/search.nl?resultjoin=${cleanJoinId}&sel=dffield&mach=detailfields&searchtype=${this.searchType}&ifrmcntnr=T&rectype=${this.recType}`,
                filterfields: `/app/common/search/search.nl?ffjoin=${cleanJoinId}&searchtype=${this.searchType}&rectype=${this.recType}&ifrmcntnr=T`
            };

            const url = urlMap[machineName];

            if (_schemaCache.has(url)) return _schemaCache.get(url);

            const response = await fetch(url);
            if (response.status != 200) throw new Error(this.settings.i18n.error_http);

            const text = await response.text();
            const doc = new DOMParser().parseFromString(text, "text/html") || "";

            const labelEl = doc.querySelector("input[id='joinlabel']");
            const labelName = labelEl ? labelEl.value : "";

            let relatedDataIds = {
                filters: "fffilter",
                returnfields: "rffield",
                summaryfilters: "filterfilter",
                detailfields: "dffield",
                filterfields: "fffilter",
                field: "field"
            };

            const dataName = relatedDataIds[machineName];
            const div = doc.querySelector(`div[data-name='${dataName}']`);
            const fields = JSON.parse(div.getAttribute("data-options") || "[]");

            const result = { fields, labelName };
            _schemaCache.set(url, result);
            return result;
        }

        handleEnterOrTabKey() {
            const idx = this.nsDropdown.indexOnDeck || 0;
            this.nsDropdown.setAndClose(idx);
        }



        handleArrowKey(key) {
            const currentIdx = this.nsDropdown.indexOnDeck || 0;
            if (currentIdx == 0 && key == "ArrowUp") return;

            let nextIdx = (key == "ArrowDown") ? currentIdx + 1 : currentIdx - 1;
            let opt = this.options[nextIdx];

            while (opt) {
                if (!opt.hidden) {
                    this.nsDropdown.respondToArrow(nextIdx - currentIdx);
                    break;
                }
                nextIdx = (key == "ArrowDown") ? nextIdx + 1 : nextIdx - 1;
                opt = this.options[nextIdx];
            }
        }
    };

    DropdownOption = class {
        constructor(dropdown, index) {
            this.dropdown = dropdown;
            this.index = index;
            this.element = dropdown.nsDropdown.divArray[index];
            this.hidden = false;
            this.dataTypeText = "";

            this.fieldIdElement = document.createElement("span");
            this.fieldIdTextElement = document.createElement("span");
            this.fieldIdCopyElement = document.createElement("span");
            this.fieldNameElement = document.createElement("span");
            this.fieldTypeElement = document.createElement("span");
            this.dataTypeElement = document.createElement("span");
            this.multiEditElement = document.createElement("span");

            this.fieldId = dropdown.nsDropdown.valueArray[index];
            this.fieldName = dropdown.nsDropdown.textArray[index].replace(/\s*\(.*?\)/g, "").trim();
            this.fieldType = this.getFieldType();

            this.buildOptionElements();
        }

        getFieldType() {
            let id = this.fieldId.toLowerCase();
            const custom = inModalFrame()
                ? id.match(/(?:^|_)(custbody|custcol|custrecord|custentity|custitem)/)
                : id.match(/^(custbody|custcol|custrecord|custentity|custitem)/);
            if (custom) {
                if (custom[1] === "custbody") return FieldType.CUSTOM_BODY;
                if (custom[1] === "custcol") return FieldType.CUSTOM_COLUMN;
                return FieldType.CUSTOM;
            }
            if (id.match(/\_formula/)) return FieldType.FORMULA;
            if (this.fieldName.endsWith("Fields...")) return FieldType.RELATED;
            return FieldType.STANDARD;
        }

        buildOptionElements() {
            this.element.setAttribute("data-nsft-ff-row", "1");

            this.element.style.setProperty("display", "flex", "important");
            this.element.style.setProperty("align-items", "center", "important");
            this.element.style.setProperty("width", "100%");

            while (this.element.firstChild) {
                this.element.removeChild(this.element.firstChild);
            }


            this.addFieldNameElement();

            const attrs = this.dropdown.settings.attributes;
            if (attrs.fieldId) this.addFieldIdElement();
            if (attrs.dataType) this.addDataTypeElement();
        }



        addFieldNameElement() {
            this.fieldNameElement.classList.add("nsft-ff-option");
            this.fieldNameElement.style.setProperty("flex", "1");
            const minW = (this.dropdown.colWidths && this.dropdown.colWidths.name) ? this.dropdown.colWidths.name : 200;
            this.fieldNameElement.style.setProperty("min-width", `${minW}px`);

            this.fieldNameElement.textContent = this.fieldName;
            this.element.appendChild(this.fieldNameElement);

            if (this.dropdown.multiSelect && this.fieldId != "" && this.fieldType != FieldType.RELATED) {
                this.fieldNameElement.style.cursor = "pointer";
                this.fieldNameElement.addEventListener("click", (e) => {
                    e.preventDefault(); e.stopPropagation();
                    this.dropdown.selectField(this.fieldId);
                });
            }

            if (this.dropdown.settings.features.relatedTableExpansion &&
                this.fieldType == FieldType.RELATED && !inModalFrame()) {
                this.fieldNameElement.style.cursor = "pointer";
                this.fieldNameElement.classList.add("nsft-ff-expandrelated");
                this.fieldNameElement.addEventListener("click", (e) => {
                    e.preventDefault(); e.stopPropagation();
                    this.dropdown.addRelatedTableFields(this.fieldId);
                });
            }
        }

        prettyFieldId() {
            const prefixes = ["stdentity", "stdbody", "custom_", "transaction_"];
            if (this.dropdown.searchType) prefixes.push(`${this.dropdown.searchType.toLowerCase()}_`);
            let id = this.fieldId.toLowerCase();
            const re = new RegExp(`(${prefixes.join("|")})`);
            return id.replace(re, "");
        }

        addFieldIdElement() {
            this.fieldIdElement.classList.add("nsft-ff-option");

            const w = (this.dropdown.colWidths && this.dropdown.colWidths.id) ? this.dropdown.colWidths.id : 280;
            this.fieldIdElement.style.setProperty("width", `${w}px`);
            this.fieldIdElement.style.setProperty("min-width", `${w}px`);
            this.fieldIdElement.style.setProperty("flex-shrink", "0");

            this.fieldIdElement.style.visibility = this.dropdown.settings.attributes.fieldId ? "visible" : "hidden";
            this.fieldIdElement.classList.add("nsft-ff-copy-fieldid");

            const idText = (this.fieldType == FieldType.RELATED) ? "" : (this.prettyFieldId() || "");
            this.fieldIdTextElement.textContent = idText;

            if (!idText || idText.trim() === "") {
                this.fieldIdCopyElement.style.display = "none";
                this.fieldIdElement.style.pointerEvents = "none";
            }

            this.fieldIdCopyElement.classList.add("nsft-ff-copy-fieldid-icon", "nsft-ff-copy-fieldid-icon-copy");
            this.fieldIdTextElement.classList.add("nsft-ff-copy-fieldid-text");
            this.fieldIdTextElement.style.width = "auto";
            this.fieldIdTextElement.style.maxWidth = `${w - 30}px`;

            this.fieldIdElement.appendChild(this.fieldIdCopyElement);
            this.fieldIdElement.appendChild(this.fieldIdTextElement);

            if (this.fieldType == FieldType.RELATED) {
                this.fieldIdElement.style.setProperty("pointer-events", "none");
            }

            this.fieldIdElement.addEventListener("mouseenter", () => {
                if (this.fieldIdElement.dataset.copying !== "true") {
                    this.fieldIdCopyElement.classList.remove("nsft-ff-copy-fieldid-icon-confirm");
                    this.fieldIdCopyElement.classList.add("nsft-ff-copy-fieldid-icon-copy");
                }
                this.fieldIdCopyElement.classList.add("nsft-make-visible");
            });

            this.fieldIdElement.addEventListener("mouseleave", () => {
                if (this.fieldIdElement.dataset.copying !== "true") {
                    this.fieldIdCopyElement.classList.remove("nsft-make-visible");
                }
            });

            this.fieldIdElement.setAttribute("onmouseup", "event.preventDefault();event.stopImmediatePropagation();");

            this.fieldIdElement.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopImmediatePropagation();
                const text = this.prettyFieldId();

                let ok = true;
                try {
                    await navigator.clipboard.writeText(text);
                } catch (err) {
                    ok = false;
                }

                try {
                    window.postMessage({
                        dest: "extension_ff",
                        type: "copied",
                        payload: { ok: ok, text: text }
                    }, "*");
                } catch (err) { }

                if (!ok) return;

                this.fieldIdElement.dataset.copying = "true";
                this.fieldIdCopyElement.classList.remove("nsft-ff-copy-fieldid-icon-copy");
                this.fieldIdCopyElement.classList.add("nsft-ff-copy-fieldid-icon-confirm");
                this.fieldIdCopyElement.classList.add("nsft-make-visible");

                setTimeout(() => {
                    this.fieldIdElement.dataset.copying = "false";
                    this.fieldIdCopyElement.classList.remove("nsft-ff-copy-fieldid-icon-confirm");
                    this.fieldIdCopyElement.classList.add("nsft-ff-copy-fieldid-icon-copy");
                    if (!this.fieldIdElement.matches(':hover')) {
                        this.fieldIdCopyElement.classList.remove("nsft-make-visible");
                    }
                }, 1000);
            });

            this.element.appendChild(this.fieldIdElement);
        }

        addDataTypeElement() {
            this.dataTypeElement.classList.add("nsft-ff-option");

            const w = (this.dropdown.colWidths && this.dropdown.colWidths.type) ? this.dropdown.colWidths.type : 80;
            this.dataTypeElement.style.setProperty("width", `${w}px`);
            this.dataTypeElement.style.setProperty("min-width", `${w}px`);
            this.dataTypeElement.style.setProperty("flex-shrink", "0");

            const text = this.dropdown.dataTypeFor(this.fieldId);

            this.dataTypeElement.textContent = text;
            this.dataTypeElement.style.visibility = this.dropdown.settings.attributes.dataType ? "visible" : "hidden";
            this.element.appendChild(this.dataTypeElement);
        }







        filterOption() {
            this.filterOnFieldType();
            if (!this.hidden) this.filterOnTextString();
        }




        addDataTypeElement() {
            this.dataTypeElement.classList.add("nsft-ff-option");

            const w = (this.dropdown.colWidths && this.dropdown.colWidths.type) ? this.dropdown.colWidths.type : 80;
            this.dataTypeElement.style.setProperty("width", `${w}px`);
            this.dataTypeElement.style.setProperty("min-width", `${w}px`);
            this.dataTypeElement.style.setProperty("flex-shrink", "0");

            let text = "";
            const ddName = this.dropdown.nsDropdown.name;
            if ((ddName == "fffilter" || ddName == "filterfilter") && typeof ffTypes === 'object') {
                text = ffTypes[this.fieldId] || "";
            } else if (ddName == "rffield" && typeof rfTypes === 'object') {
                text = rfTypes[this.fieldId] || "";
            }

            this.dataTypeText = (text || "").trim();
            this.dataTypeElement.textContent = text;
            this.dataTypeElement.style.visibility = this.dropdown.settings.attributes.dataType ? "visible" : "hidden";
            this.element.appendChild(this.dataTypeElement);
        }


        filterOnFieldType() {
            const s = this.dropdown.fieldTypeStatus;

            const values = [s.customFields, s.relatedTableFields, s.standardFields, s.formulaFields, s.emptyTypeFields];
            const uniqueValues = new Set(values);

            if (uniqueValues.size != 1) {
                let shouldShow = false;

                if (this.fieldType === FieldType.RELATED) {
                    if (s.relatedTableFields) shouldShow = true;
                } else if (this.fieldType === FieldType.CUSTOM || this.fieldType === FieldType.CUSTOM_BODY || this.fieldType === FieldType.CUSTOM_COLUMN) {
                    if (s.customFields) shouldShow = true;
                } else if (this.fieldType === FieldType.FORMULA) {
                    if (s.formulaFields) shouldShow = true;
                } else {
                    if (s.standardFields) shouldShow = true;
                }

                if (!shouldShow && s.emptyTypeFields && this.dataTypeText === "") {
                    shouldShow = true;
                }

                shouldShow ? this.show() : this.hide();
            } else {
                this.show();
            }
        }

        filterOnTextString() {
            const val = this.dropdown.searchInputField.value;
            if (!val) {
                this.resetOptionToOriginal();
                return;
            }

            const name = this.fieldName || "";
            const showId = this.dropdown.settings.attributes.fieldId && this.fieldType != FieldType.RELATED;
            const prettyId = showId ? (this.prettyFieldId() || "") : "";

            const namePos = [];
            const idPos = [];
            let todas = true;
            for (const word of ffWords(val)) {
                const enNombre = ffWordPositions(name, word);
                const enId = showId ? ffWordPositions(prettyId, word) : null;
                if (!enNombre && !enId) { todas = false; break; }
                if (enNombre) namePos.push(...enNombre);
                if (enId) idPos.push(...enId);
            }

            if (todas) {
                this.show();
                this.fieldNameElement.innerHTML = ffHighlight(name, namePos);
                if (showId) this.fieldIdTextElement.innerHTML = ffHighlight(prettyId, idPos);
            } else {
                this.hide();
                this.resetOptionToOriginal();
            }
        }



        resetOptionToOriginal() {
            this.fieldNameElement.textContent = this.fieldName || "";
            if (this.fieldType != FieldType.RELATED) {
                this.fieldIdTextElement.textContent = this.prettyFieldId();
            }
        }

        hide() {
            this.element.style.setProperty("display", "none", "important");
            this.hidden = true;
        }

        show() {
            this.element.style.setProperty("display", "flex", "important");
            this.hidden = false;
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeFieldFinder);
    } else {
        initializeFieldFinder();
    }
    if (typeof NS !== 'undefined' && NS.event && NS.event.type) {
        if (NS.form && NS.form.isInited && NS.form.isInited()) {
        } else {
            NS.event.once(NS.event.type.FORM_INITED, initializeFieldFinder);
        }
    }

})();
