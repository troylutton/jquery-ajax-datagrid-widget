/**
 * Generic datagrid Widget to wrap common functions such as:
 *
 *      - ajax grid paging
 *      - ajax grid sorting
 *      - ajax grid searching
 *      - ajax grid search autocomplete
 *      - automatic ajax grid filtering based on realtime search strings
 *  
 * Built to be pluggable and configurable. Wraps jQuery and jQuery ui widgets/functions
 *
 * Example usage: 
 *
 *    $('.data-grid-container').datagrid({
 *       search: {
 *          filterResults: true,
 *             autocomplete: {
 *                enabled: false,
 *                renderer: function (ul, item) {
 *                   return $("<li>").append('<a href="/my/details/page/' + item.id + '"><b>' + item.title + "</b><br>" + item.name + "</a>").appendTo(ul);
 *               }
 *            }
 *        }
 *    });
 *
 */
(function ($) {

    $.widget("ui.ajaxgrid", {

        options: {

            // optional for remote grid location refreshing
            url: undefined,

            // grid config
            dataGridClass: ".data-grid",
            containerClass: ".data-grid-container",

            // the attribute on the container to identify the search box
            searchDataAttribute: 'grid-search-form',
            searchFieldClass: '.grid-search-term',

            // pagination config
            paginationParamName: 'page',
            paginationClass: ".grid-pagination",

            // add custom events to the grid once build and each time its refreshed
            events: function(element, seachFormId) {},

            // grid search functionality
            search: {

                // filter the grid in realtime
                filterResults: false,

                // hijack the form submission
                // expects function (gridContainer, searchForm) {}
                submit: undefined,

                // autocomplete result suggestions
                autocomplete: {
                    url: null,
                    enabled: true,
                    // expects function (gridContainer, searchForm, options) {}
                    worker: undefined,
                    // expects: function (ul, item) {}
                    renderer: undefined,
                    // what to do when an item is selected
                    // expects function (item) {}
                    onSelect: undefined
                },
            }
        },

        _create: function () {
            // hook_create()
            this._trigger('afterCreate', null, this);
        },

        _init: function () {
            var self = this;

            // hijack the sorting links with ajax calls; delegated version for bubbled events
            this.element.on("click", this.options.dataGridClass + ' thead th a', function (e) {
                e.preventDefault();
                self._doColumnSort(this, self.element);
            });

            // hijack the pagination links with ajax calls; delegated version for bubbled events
            this.element.on("click", this.options.paginationClass + ' a', function (e) {
                e.preventDefault();
                self._doPagination(this, self.element);
            });

            // get the scoped serch form selector. must support event bubbling
            var searchFormId = this.element.data(this.options.searchDataAttribute);

            // see if this datagrid has a seach form
            if ($(searchFormId).length > 0) {

                // HIJACK THE RESET

                // hijack the sorting links with ajax calls; delegated version for bubbled events
                $(document).on("click", searchFormId + ' .grid-search-reset', function (e) {
                    e.preventDefault();
                    // clear the search and reload the default grid using the reset url
                    $('input', searchFormId).val('');
                    self._getGridAndPagination(this.href, {}, self.element);
                });

                // HIJACK SEARCH SUBMIT

                // look for a hijack method for submitting results
                if (!this.options.search.submit) {

                    // use the default submitter
                    this.options.search.submit = function (gridContainer, formId) {
                        self._getSearchResults(gridContainer, formId);
                    }
                }

                // attach the submit event
                $(document).on("submit", searchFormId + ' form', function (e) {
                    e.preventDefault();
                    self.options.search.submit(this.element, searchFormId);
                });
                    
                // ATTACH AUTOCOMPLETE

                // attach an autocomplete where required
                if (true == this.options.search.autocomplete.enabled) {

                    if (!this.options.search.autocomplete.worker) {
                        // use the default autocomplete
                        this.options.search.autocomplete.worker = function (gridContainer, form, opt) {
                            self._attachAutocomplete(gridContainer, form, opt);
                        }
                    }

                    if (!this.options.search.autocomplete.renderer) {
                        // use the default renderer; convention based
                        this.options.search.autocomplete.renderer = function (ul, item) {
                            return self._renderAutocompleteItem(ul, item);
                        }
                    }
                        
                    // build some options
                    var options = {
                        url: null == this.options.search.autocomplete.url ? window.location.pathname + '/search' : this.options.search.autocomplete.url
                    };

                    // call the worker to attach the autocomplete
                    this.options.search.autocomplete.worker(this.element, searchFormId, options);
                }

                // FILTER RESULTS AS SEARCH IS DONE

                if (true == this.options.search.filterResults) {

                    //setup before functions
                    var typingTimer;                //timer identifier
                    var doneTypingInterval = 500;  //time in ms, 1/2 second for example

                    // filter the viewable results as we go
                    $(document).on("keyup", searchFormId + ' ' + this.options.searchFieldClass, function (e) {
                        /*if (e.which.code == 13) {
                            return clearTimeout(typingTimer);
                        }*/

                        clearTimeout(typingTimer);
                        typingTimer = setTimeout(function() {
                            self.options.search.submit(self.element, searchFormId);    
                        }, doneTypingInterval);
                    });

                    //on keydown, clear the countdown 
                    $(document).on("keydown", searchFormId + ' ' + this.options.searchFieldClass, function (e) {
                        clearTimeout(typingTimer);
                    });
                }
            }

            // add custom events
            this.options.events(this.element, searchFormId);

            // hook_init()
            this._trigger('afterInit', null, this);
        },

        _getSearchResults: function (gridContainer, searchFormId) {
            var searchForm = $(searchFormId);
            if (!searchForm.is('form')) {
                searchForm = $('form', searchForm);
            }
            // query the server and replace the contents of the grid
            this._getGridAndPagination(searchForm.attr('action'), searchForm.serialize(), gridContainer, 'afterSearch', 'post');
        },

        _attachAutocomplete: function (gridContainer, searchFormId, options) {

            // init
            var self = this;
            var searchForm = $('form', searchFormId);
            var searchBox = $(this.options.searchFieldClass, searchForm);
            var url = null == options.url ? searchForm.attr('action') : options.url;

            // hijack the seach form
            var autocomplete = searchBox.autocomplete({
                minLength: 2,
                select: function(event, ui) {
                    self.options.search.autocomplete.onSelect(event, ui);
                },
                source: function(request, response) {
                    $.ajax({
                        type: 'post',
                        url: url,
                        data: {
                            SearchTerm: request.term
                        }
                    }).done(function(data) {
                        response(data);
                    });
                }
            });

            if (this.options.search.autocomplete.renderer) {
                // call the custom autocomplete renderer
                autocomplete.data("ui-autocomplete")._renderItem = function (ul, item) {
                    //return self._renderAutocompleteItem(ul, item);
                    return self.options.search.autocomplete.renderer(ul, item);
                };
            }
        },

        _renderAutocompleteItem: function (ul, item) {

            // convention based assumes that there is an ID and a Name
            var name = (item['name'] ? item['name'] : item['Name']);
            var link = window.location.pathname + '/edit/' + (item['id'] ? item['id'] : item['ID']);
            return $("<li>").append('<a href="' + link + '">' + name + "</a>").appendTo(ul);
        },

        _doColumnSort: function (element, gridContainer) {

            // remove the page number if sorting
            var link = element.href;
            var regex = new RegExp('(&){0,1}' + this.options.paginationParamName + '=(\\d+)', 'i');
            
            // paginationParamName
            if (link.match(regex)) {
                link = link.replace(regex, '');
            }

            // query the server and replace the contents of the grid
            this._getGridAndPagination(link, {}, gridContainer, 'afterColumnSort');
        },

        _doPagination: function (element, gridContainer) {

            // query the server and replace the contents of the grid
            this._getGridAndPagination(element.href, {}, gridContainer, 'afterPagination');
        },

        _getGridAndPagination: function (href, params, gridContainer, callback, method) {

            var self = this;

            // get contextual refs to the grid and pagination
            var grid = $(this.options.dataGridClass, gridContainer);
            var pagination = $(this.options.paginationClass, gridContainer);
            var loadMethod = (method == 'post') ? $.post : $.get;

            // send the request and replace the content
            loadMethod(href, params, function (data) {
                // get a querable result
                var result = $(data);
                // replace datagrid
                grid.html(result.find(self.options.dataGridClass).html());
                // replace pagination
                pagination.html(result.find(self.options.paginationClass).html());

                // re-add custom events
                self.options.events(self.element, self.element.data(self.options.searchDataAttribute));

                // hook_x() expects string callback name
                if (callback != undefined) {
                    // direct closure callback or hook
                    if (typeof callback == 'function') {
                        callback.call();
                    }
                    else
                    {
                        // call hook_x
                        self._trigger(callback, null, this);
                    }
                }
            });
        },

        // provide a refresh capability
        refreshGrid: function (callback) {
            this._getGridAndPagination(this.options.url, {}, this.element, callback);
        },

        // mandatory function
        destroy: function () {

        }
    });

})(jQuery);