frappe.ui.form.on("Employee", {
	refresh(frm) {
		setup_pos_password_reveal(frm);
	},
	onload_post_render(frm) {
		setup_pos_password_reveal(frm);
	},
});

function setup_pos_password_reveal(frm) {
	const field = frm.get_field("custom_pos_password");
	if (!field || !field.$input || !field.toggle_password) return;

	const storage_key = `sultan:employee-pos-password-visible:${frm.doc.name || "new"}`;

	const reveal = () => {
		field.$input.attr("type", "text");
		field.toggle_password.html(frappe.utils.icon("hide", "sm"));
		field.toggle_password.removeClass("hidden");
	};

	const conceal = () => {
		field.$input.attr("type", "password");
		field.toggle_password.html(frappe.utils.icon("unhide", "sm"));
		field.toggle_password.removeClass("hidden");
	};

	const load_password = () => {
		if (frm.is_new()) {
			reveal();
			return;
		}

		frappe.call({
			method: "sultan.sultan.api.electron.employee_auth.get_employee_pos_password",
			args: { employee: frm.doc.name },
			callback(r) {
				if (r.message !== undefined) {
					field.$input.val(r.message);
					field.value = r.message;
				}
				reveal();
			},
		});
	};

	field.toggle_password.off("click").on("click.sultan_pos_password", (event) => {
		event.preventDefault();
		event.stopImmediatePropagation();

		if (field.$input.attr("type") === "password") {
			localStorage.setItem(storage_key, "1");
			load_password();
		} else {
			localStorage.removeItem(storage_key);
			conceal();
		}
	});

	if (localStorage.getItem(storage_key) === "1") {
		load_password();
	} else {
		conceal();
	}
}
