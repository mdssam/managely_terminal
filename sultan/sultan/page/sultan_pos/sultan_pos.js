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

    // 2. Inject full-height dynamic iframe loading the beautiful view we built
    const iframeHtml = `
        <iframe 
            src="/sultan_pos" 
            style="width: 100%; height: calc(100vh - 50px); border: none; background: #0a0915;" 
            title="Sultan Premium View">
        </iframe>
    `;

    $(iframeHtml).appendTo(page.main);
}
