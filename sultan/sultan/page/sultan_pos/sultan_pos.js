frappe.pages['sultan_pos'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: '👑 Sultan POS Station',
		single_column: true
	});

    // 1. Styling configuration for seamless embedding
    $(wrapper).find('.layout-main-section').css({
        'padding': '0px',
        'background': '#0a0915'
    });
    
    // Hide standard frappe page header to allow full-screen visual impact
    $(wrapper).find('.page-head').hide();

    // 2. Inject full-height iframe embedding the Sultan POS SPA
    var iframeHtml = '<iframe src="/sultan_spa" style="width: 100%; height: calc(100vh - 50px); border: none; background: #ffffff;" title="Sultan POS"></iframe>';

    $(iframeHtml).appendTo(page.main);
}
