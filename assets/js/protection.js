
(function () {
    // Disable right-click
    document.addEventListener("contextmenu", function (e) {
        e.preventDefault();
    });

    // Disable common developer tools / source shortcuts
    document.addEventListener("keydown", function (e) {

        // F12
        if (e.key === "F12") {
            e.preventDefault();
            return false;
        }

        // Ctrl + Shift + I
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "i") {
            e.preventDefault();
            return false;
        }

        // Ctrl + Shift + J
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "j") {
            e.preventDefault();
            return false;
        }

        // Ctrl + Shift + C
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "c") {
            e.preventDefault();
            return false;
        }

        // Ctrl + U
        if (e.ctrlKey && e.key.toLowerCase() === "u") {
            e.preventDefault();
            return false;
        }

        // Ctrl + S
        if (e.ctrlKey && e.key.toLowerCase() === "s") {
            e.preventDefault();
            return false;
        }
    });

    // Disable text selection
    document.addEventListener("selectstart", function (e) {
        e.preventDefault();
    });

    // Disable drag of images
    document.addEventListener("dragstart", function (e) {
        if (e.target.tagName === "IMG") {
            e.preventDefault();
        }
    });
})();