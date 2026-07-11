jQuery(function ($) {
    var $builder = $('#page-builder');
    var template = $('#page-row-template').html();
    var indexCounter = $builder.children('.page-row').length;

    // ── Add new row ──
    $('#add-page-btn').on('click', function () {
        var html = template.replace(/__INDEX__/g, indexCounter++);
        var $row = $(html);
        $builder.append($row);
        bindRowEvents($row);
    });

    // ── Remove row ──
    function bindRowEvents($row) {
        $row.find('.remove-page').on('click', function () {
            $row.remove();
        });
        $row.find('.source-type-select').on('change', function () {
            updateSourceField($(this));
        });
    }

    // ── Switch source type input ──
    function updateSourceField($select) {
        var type = $select.val();
        var $wrap = $select.closest('.page-row').find('.source-value-wrap');
        var name = $select.attr('name').replace('[source_type]', '[source_value]');

        if (type === 'internal') {
            var wpPages = (window.festivalPWA && festivalPWA.wpPages) || [];
            var $sel = $('<select>').addClass('source-value-select').attr('name', name);
            $sel.append('<option value="">— Select WP page —</option>');
            wpPages.forEach(function (p) {
                $sel.append('<option value="' + p.id + '">' + p.title + ' (ID: ' + p.id + ')</option>');
            });
            $wrap.empty().append($sel);
        } else {
            var placeholder = type === 'source'
                ? 'page-slug (relative to source)'
                : 'https://example.com/page';
            $wrap.empty().append(
                '<input type="text" name="' + name + '" ' +
                'class="regular-text source-value-text" placeholder="' + placeholder + '">'
            );
        }
    }

    // Bind existing rows on load
    $builder.children('.page-row').each(function () {
        bindRowEvents($(this));
    });

    // ── Show/hide custom URL input ──
    $('input[name="source_mode"]').on('change', function () {
        $('#source_url_input').toggle($(this).val() === 'custom');
    });
});
