"""
Create three 80mm thermal receipt print formats and one A4 Sales Invoice print format for Sultan POS.
Called from setup_fields.run() or directly via bench execute.
"""

import frappe

# ── Client Vector Logos ───────────────────────────────────────────────────────
LOGO_SQUARE = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 141.732 141.732" style="width: 32mm; height: 32mm; margin: 0 auto; display: block;">
<g transform="scale(1, -1) translate(0, -141.732)">
<g>
<g>
<g transform="matrix(1.0 0.0 0.0 1.0 116.6301 118.0053)">
<path d="M 0.0 0.0 L 3.323 -3.294 L 6.646 0.0 L 3.323 3.322 Z M 9.621 -7.526 C 10.777 -8.615, 11.354 -10.132, 11.354 -12.077 L 11.354 -14.966 L -5.836 -14.966 L -5.836 -5.894 L 4.796 -5.894 C 6.857 -5.894, 8.465 -6.438, 9.621 -7.526 M 11.354 -14.966 L 8.119 -14.966 C 7.213 -14.966, 6.466 -15.106, 5.88 -15.385 C 5.292 -15.664, 4.585 -16.218, 3.757 -17.046 L 2.802 -17.999 C 1.974 -18.828, 1.166 -19.381, 0.376 -19.661 C -0.415 -19.94, -1.579 -20.08, -3.12 -20.08 L -10.92 -20.08 L -10.92 -17.017 L -3.12 -17.017 C -2.099 -17.017, -1.276 -16.878, -0.65 -16.598 C -0.024 -16.319, 0.703 -15.765, 1.531 -14.937 L 2.485 -13.984 C 3.313 -13.156, 4.103 -12.602, 4.854 -12.322 C 5.605 -12.043, 6.694 -11.904, 8.119 -11.904 L 11.354 -11.904 Z M -7.887 -20.08 L -10.92 -20.08 L -10.92 3.0330000000000013 L -7.887 3.0330000000000013 Z M -7.887 3.033 M -19.154 -10.864 L -15.831 -14.157 L -12.51 -10.864 L -15.831 -7.541 Z M -27.417 0.0 L -24.095 -3.294 L -20.773 0.0 L -24.095 3.322 Z M -10.632 -2.832 L -10.632 -5.894 L -20.773 -5.894 L -20.773 -15.082 C -20.773 -16.026, -20.989 -16.878, -21.422 -17.638 C -21.856 -18.4, -22.453 -18.996, -23.214 -19.429 C -23.974 -19.863, -24.828 -20.08, -25.771 -20.08 L -29.092 -20.08 L -22.217 -2.832 Z" fill="black" stroke="none" stroke-width="1" />
</g>
<path d="M 127.984 72.085 L 124.922 72.085 L 124.922 95.198 L 127.984 95.198 Z M 127.984 95.198 M 122.899 72.085 L 119.836 72.085 L 119.836 95.198 L 122.899 95.198 Z M 122.899 95.198 M 92.578 90.012 C 93.936 88.924, 95.048 87.34, 95.915 85.26 C 97.436 89.092, 99.747 92.405, 102.849 95.198 C 105.93 92.405, 108.232 89.092, 109.754 85.26 C 110.62 87.34, 111.738 88.924, 113.105 90.012 C 114.473 91.1, 116.042 91.644, 117.815 91.644 L 117.815 72.085 L 87.884 72.085 L 87.884 91.644 C 89.655 91.644, 91.22 91.1, 92.578 90.012 M 85.832 72.085 L 82.76899999999999 72.085 L 82.76899999999999 95.198 L 85.832 95.198 Z M 85.832 95.198 M 53.85 95.198 L 53.85 91.644 L 70.549 91.644 C 72.668 91.644, 74.492 91.206, 76.024 90.33 C 77.555 89.453, 78.725 88.182, 79.534 86.516 C 80.343 84.85, 80.747 82.862, 80.747 80.55 L 80.747 72.085 L 50.817 72.085 L 50.817 95.198 Z M 122.899 72.085 L 45.730999999999995 72.085 L 45.730999999999995 75.148 L 122.899 75.148 Z M 48.765 72.085 L 45.731 72.085 L 45.731 95.198 L 48.765 95.198 Z M 48.765 95.198 M 25.392 81.85 L 28.715 78.557 L 32.037 81.85 L 28.715 85.173 Z M 43.68 91.644 L 43.68 81.85 C 43.68 78.711, 42.842 76.298, 41.167 74.613 C 39.49 72.928, 37.074 72.085, 33.914 72.085 L 23.514 72.085 C 20.375 72.085, 17.962 72.928, 16.277 74.613 C 14.591 76.298, 13.748 78.711, 13.748 81.85 C 13.748 85.009, 14.587 87.43, 16.262 89.117 C 17.938 90.801, 20.355 91.644, 23.514 91.644 Z" fill="black" stroke="none" stroke-width="1" />
<g>
<g transform="matrix(1.0 0.0 0.0 1.0 17.9032 31.1324)">
<path d="M 0.0 0.0 L 0.0 -4.808 L 0.461 -4.808 C 1.251 -4.808, 1.647 -4.216, 1.647 -2.207 C 1.647 -0.659, 1.284 0.0, 0.461 0.0 Z M 0.0 7.575 L 0.0 2.898 L 0.297 2.898 C 1.02 2.898, 1.317 3.788, 1.317 5.106 C 1.317 7.146, 0.922 7.575, 0.23 7.575 Z M -3.689 10.966 L 0.824 10.966 C 3.623 10.966, 5.072 9.353, 5.072 6.555 C 5.072 3.984, 4.249 2.569, 2.469 1.976 L 2.469 1.91 C 3.986 1.68, 5.401 0.593, 5.401 -2.766 C 5.401 -5.928, 3.82 -8.234, 0.988 -8.234 L -3.689 -8.234 Z" fill="black" stroke="none" stroke-width="1" />
</g>
<g>
<g transform="matrix(1.0 0.0 0.0 1.0 30.6209 30.1107)">
<path d="M 0.0 0.0 L 1.385 0.0 L 1.153 3.229 L 0.858 7.576 L 0.659 7.576 L 0.297 3.261 Z M -1.613 11.988 L 3.327 11.988 L 5.732 -7.212 L 1.944 -7.212 L 1.648 -3.391 L -0.328 -3.391 L -0.691 -7.212 L -4.445 -7.212 Z" fill="black" stroke="none" stroke-width="1" />
</g>
<g>
<g transform="matrix(1.0 0.0 0.0 1.0 39.9103 42.0988)">
<path d="M 0.0 0.0 L 3.689 0.0 L 3.689 -9.188 L 5.83 0.0 L 9.222 0.0 L 7.048 -8.463 L 9.255 -19.2 L 5.567 -19.2 L 3.689 -9.749 L 3.689 -19.2 L 0.0 -19.2 Z" fill="black" stroke="none" stroke-width="1" />
</g>
<g>
<g transform="matrix(1.0 0.0 0.0 1.0 52.7245 42.0988)">
<path d="M 0.0 0.0 L 7.443 0.0 L 7.443 -3.621 L 3.689 -3.621 L 3.689 -7.773 L 6.95 -7.773 L 6.95 -11.13 L 3.689 -11.13 L 3.689 -15.545 L 7.509 -15.545 L 7.509 -19.2 L 0.0 -19.2 Z" fill="black" stroke="none" stroke-width="1" />
</g>
<g>
<g transform="matrix(1.0 0.0 0.0 1.0 67.7996 38.7074)">
<path d="M 0.0 0.0 L 0.0 -6.29 L 0.034 -6.29 C 0.922 -6.29, 1.415 -6.026, 1.415 -3.064 C 1.415 -0.725, 1.186 0.0, 0.098 0.0 Z M -3.689 3.391 L 0.625 3.391 C 3.952 3.391, 5.171 1.449, 5.171 -3.064 C 5.171 -5.204, 4.577 -6.817, 3.722 -7.904 L 5.533 -15.809 L 1.844 -15.809 L 0.692 -9.683 L 0.493 -9.683 L 0.0 -9.683 L 0.0 -15.809 L -3.689 -15.809 Z" fill="black" stroke="none" stroke-width="1" />
</g>
<g>
<g transform="matrix(1.0 0.0 0.0 1.0 79.0283 29.354)">
<path d="M 0.0 0.0 L -3.26 12.745 L 0.758 12.745 L 1.417 8.102 L 1.844 4.479 L 1.976 4.479 L 2.405 8.102 L 3.064 12.745 L 6.85 12.745 L 3.689 -0.329 L 3.689 -6.455 L 0.0 -6.455 Z" fill="black" stroke="none" stroke-width="1" />
</g>
<g>
<g transform="matrix(1.0 0.0 0.0 1.0 115.3782 38.3125)">
<path d="M 0.0 0.0 L 0.0 -6.202 L 1.453 -6.202 C 1.463 -6.181, 1.497 -6.121, 1.551 -6.025 C 1.582 -5.949, 1.632 -5.879, 1.696 -5.815 C 1.759 -5.75, 1.842 -5.694, 1.938 -5.645 C 2.035 -5.597, 2.154 -5.573, 2.294 -5.573 C 2.52 -5.573, 2.706 -5.653, 2.851 -5.815 C 2.997 -5.976, 3.068 -6.17, 3.068 -6.396 L 3.068 -9.093 C 3.068 -9.361, 3.002 -9.572, 2.867 -9.722 C 2.732 -9.873, 2.541 -9.948, 2.294 -9.948 C 2.045 -9.948, 1.844 -9.871, 1.688 -9.715 C 1.532 -9.559, 1.453 -9.34, 1.453 -9.06 L 1.453 -8.641 L -0.195 -8.641 L -0.195 -9.125 C -0.195 -9.512, -0.126 -9.857, 0.009 -10.159 C 0.142 -10.46, 0.322 -10.72, 0.549 -10.933 C 0.775 -11.149, 1.036 -11.314, 1.332 -11.428 C 1.628 -11.54, 1.938 -11.596, 2.261 -11.596 C 2.583 -11.596, 2.893 -11.54, 3.189 -11.428 C 3.486 -11.314, 3.747 -11.149, 3.973 -10.933 C 4.199 -10.72, 4.379 -10.46, 4.514 -10.159 C 4.649 -9.857, 4.716 -9.512, 4.716 -9.125 L 4.716 -6.154 C 4.716 -5.475, 4.541 -4.966, 4.19 -4.628 C 3.841 -4.288, 3.386 -4.118, 2.827 -4.118 C 2.536 -4.118, 2.271 -4.171, 2.035 -4.272 C 1.798 -4.374, 1.603 -4.5, 1.453 -4.651 L 1.453 -1.551 L 4.716 -1.551 L 4.716 0.0 Z M -4.739 -11.499 L -1.945 -1.647 L -1.945 0.0 L -6.855 0.0 L -6.855 -2.876 L -5.401 -2.876 L -5.401 -1.551 L -3.592 -1.551 L -6.484 -11.499 Z M -11.951 -2.375 C -11.951 -2.127, -11.871 -1.928, -11.708 -1.777 C -11.547 -1.626, -11.359 -1.551, -11.144 -1.551 C -10.928 -1.551, -10.739 -1.626, -10.578 -1.777 C -10.416 -1.928, -10.336 -2.127, -10.336 -2.375 L -10.336 -4.505 C -10.336 -4.754, -10.416 -4.952, -10.578 -5.103 C -10.739 -5.256, -10.928 -5.329, -11.144 -5.329 C -11.359 -5.329, -11.547 -5.256, -11.708 -5.103 C -11.871 -4.952, -11.951 -4.754, -11.951 -4.505 Z M -11.159 -11.499 L -8.995 -5.718 C -8.941 -5.567, -8.895 -5.424, -8.858 -5.289 C -8.82 -5.156, -8.785 -5.001, -8.753 -4.83 C -8.732 -4.668, -8.715 -4.472, -8.704 -4.239 C -8.694 -4.008, -8.688 -3.715, -8.688 -3.359 C -8.688 -2.983, -8.694 -2.672, -8.704 -2.431 C -8.715 -2.189, -8.732 -1.982, -8.753 -1.809 C -8.785 -1.647, -8.829 -1.507, -8.883 -1.39 C -8.936 -1.271, -9.0 -1.148, -9.076 -1.018 C -9.291 -0.673, -9.577 -0.401, -9.933 -0.202 C -10.287 -0.004, -10.691 0.096, -11.144 0.096 C -11.596 0.096, -12.002 0.0, -12.363 -0.195 C -12.724 -0.387, -13.012 -0.662, -13.227 -1.018 C -13.303 -1.148, -13.364 -1.271, -13.413 -1.39 C -13.46 -1.507, -13.495 -1.647, -13.518 -1.809 C -13.55 -1.982, -13.571 -2.189, -13.581 -2.431 C -13.593 -2.672, -13.599 -2.983, -13.599 -3.359 C -13.599 -3.812, -13.593 -4.187, -13.581 -4.483 C -13.571 -4.779, -13.55 -5.022, -13.518 -5.217 C -13.495 -5.411, -13.464 -5.569, -13.42 -5.694 C -13.378 -5.818, -13.318 -5.934, -13.243 -6.041 C -13.103 -6.256, -12.91 -6.433, -12.661 -6.573 C -12.414 -6.714, -12.144 -6.784, -11.853 -6.784 C -11.671 -6.784, -11.522 -6.77, -11.41 -6.743 C -11.296 -6.717, -11.214 -6.682, -11.159 -6.638 L -11.128 -6.67 L -13.001 -11.499 Z M -16.119 -11.499 L -16.119 0.0 L -17.768 0.0 L -19.415 -1.211 L -19.415 -2.956 L -17.768 -1.745 L -17.768 -11.499 Z M -7.338 -17.907 L -7.338 -17.908 C -7.341 -17.908, -7.345 -17.907, -7.35 -17.907 C -7.354 -17.907, -7.358 -17.908, -7.363 -17.908 L -7.363 -17.907 C -20.115 -17.898, -27.261 -11.878, -27.261 -5.814 C -27.261 0.251, -20.115 6.271, -7.363 6.28 L -7.363 6.28 C -7.358 6.28, -7.354 6.28, -7.35 6.28 C -7.345 6.28, -7.341 6.28, -7.338 6.28 L -7.338 6.28 C 5.551 6.271, 12.562 0.251, 12.562 -5.814 C 12.562 -11.878, 5.551 -17.898, -7.338 -17.907" fill="black" stroke="none" stroke-width="1" />
</g>
<g>
<g transform="matrix(1.0 0.0 0.0 1.0 14.2393 53.2692)">
<path d="M 0.0 0.0 C 1.627 -0.797, 5.016 -1.395, 7.274 -1.395 C 8.537 -1.395, 9.234 -1.029, 9.234 -0.464 C 9.234 0.465, 6.809 0.532, 4.118 1.362 C 1.262 2.259, -0.299 3.521, -0.299 7.242 C -0.299 11.559, 3.555 13.951, 7.972 13.951 C 10.695 13.951, 13.354 13.287, 14.649 12.622 L 14.649 7.474 C 13.785 7.972, 10.995 8.703, 8.869 8.703 C 7.44 8.703, 6.012 8.47, 6.012 7.64 C 6.012 7.075, 6.809 6.71, 9.168 6.245 C 12.124 5.647, 15.446 4.385, 15.446 0.266 C 15.446 -4.65, 11.426 -6.311, 6.477 -6.311 C 4.285 -6.311, 2.126 -5.879, 0.0 -5.048 Z" fill="black" stroke="none" stroke-width="1" />
</g>
<g>
<g transform="matrix(1.0 0.0 0.0 1.0 32.1702 54.4655)">
<path d="M 0.0 0.0 L 0.0 12.323 L 6.942 12.323 L 6.942 1.395 C 6.942 -1.462, 7.739 -2.591, 10.064 -2.591 C 11.925 -2.591, 12.888 -1.595, 12.888 1.428 L 12.888 12.323 L 19.831 12.323 L 19.831 0.896 C 19.831 -4.949, 15.612 -7.507, 9.865 -7.507 C 3.587 -7.507, 0.0 -4.883, 0.0 0.0" fill="black" stroke="none" stroke-width="1" />
</g>
<g>
<g transform="matrix(1.0 0.0 0.0 1.0 55.468 66.7886)">
<path d="M 0.0 0.0 L 6.942 0.0 L 6.942 -14.283 L 13.984 -14.283 L 13.984 -19.365 L 0.0 -19.365 Z" fill="black" stroke="none" stroke-width="1" />
</g>
<g>
<g transform="matrix(1.0 0.0 0.0 1.0 67.8216 66.7886)">
<path d="M 0.0 0.0 L 18.7 0.0 L 18.7 -5.082 L 12.755 -5.082 L 12.755 -19.365 L 5.813 -19.365 L 5.813 -5.082 L 0.0 -5.082 Z" fill="black" stroke="none" stroke-width="1" />
</g>
<g>
<g transform="matrix(1.0 0.0 0.0 1.0 93.6418 55.5285)">
<path d="M 0.0 0.0 L 3.288 0.0 L 3.056 0.863 L 1.926 5.015 L 1.761 5.015 L 0.299 0.797 Z M -1.329 11.26 L 6.112 11.26 L 12.788 -8.105 L 5.514 -8.105 L 4.651 -5.049 L -1.727 -5.049 L -2.757 -8.105 L -9.234 -8.105 Z" fill="black" stroke="none" stroke-width="1" />
</g>
<g>
<g transform="matrix(1.0 0.0 0.0 1.0 108.1802 66.7886)">
<path d="M 0.0 0.0 L 5.481 0.0 L 13.585 -8.57 L 13.785 -8.57 L 13.785 0.0 L 19.763 0.0 L 19.763 -19.365 L 14.117 -19.365 L 6.112 -10.696 L 5.946 -10.696 L 5.946 -19.365 L 0.0 -19.365 Z" fill="black" stroke="none" stroke-width="1" />
</g>
</g>
</g>
</g>
</g>
</g>
</g>
</g>
</g>
</g>
</g>
</g>
</g>
</g>
</g>
</g>
</g>
</svg>"""

LOGO_HORIZONTAL = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 683.056 141.732" style="max-width: 100%; height: auto; display: block;">
<g transform="scale(1, -1) translate(0, -141.732)">
<g>
<path d="M 603.076 53.65 L 598.025 53.65 L 598.025 91.77199999999999 L 603.076 91.77199999999999 Z M 603.076 91.772 M 594.69 53.65 L 589.638 53.65 L 589.638 91.77199999999999 L 594.69 91.77199999999999 Z M 594.69 91.772 M 544.677 83.219 C 546.917 81.424, 548.752 78.811, 550.181 75.38 C 552.691 81.701, 556.502 87.166, 561.618 91.772 C 566.7 87.166, 570.498 81.701, 573.007 75.38 C 574.437 78.811, 576.278 81.424, 578.535 83.219 C 580.791 85.013, 583.378 85.911, 586.302 85.911 L 586.302 53.65 L 536.934 53.65 L 536.934 85.911 C 539.855 85.911, 542.438 85.013, 544.677 83.219 M 533.55 53.65 L 528.4989999999999 53.65 L 528.4989999999999 91.77199999999999 L 533.55 91.77199999999999 Z M 533.55 91.772 M 480.798 91.772 L 480.798 85.911 L 508.342 85.911 C 511.836 85.911, 514.847 85.188, 517.372 83.743 C 519.898 82.297, 521.828 80.2, 523.162 77.452 C 524.497 74.704, 525.163 71.424, 525.163 67.612 L 525.163 53.65 L 475.795 53.65 L 475.795 91.772 Z M 594.69 53.65 L 467.40900000000005 53.65 L 467.40900000000005 58.701 L 594.69 58.701 Z M 472.411 53.65 L 467.408 53.65 L 467.408 91.77199999999999 L 472.411 91.77199999999999 Z M 472.411 91.772 M 433.861 69.756 L 439.341 64.324 L 444.82 69.756 L 439.341 75.237 Z M 464.025 85.911 L 464.025 69.756 C 464.025 64.578, 462.642 60.599, 459.878 57.82 C 457.114 55.039, 453.127 53.65, 447.918 53.65 L 430.763 53.65 C 425.584 53.65, 421.605 55.039, 418.827 57.82 C 416.046 60.599, 414.657 64.578, 414.657 69.756 C 414.657 74.967, 416.038 78.961, 418.802 81.741 C 421.566 84.521, 425.553 85.911, 430.763 85.911 Z" fill="black" stroke="none" stroke-width="1" />
<g>
<g transform="matrix(1.0 0.0 0.0 1.0 661.4027 92.2491)">
<path d="M 0.0 0.0 L 5.48 -5.48 L 0.0 -10.913 L -5.481 -5.48 Z M -2.049 -15.202 L -15.106 -15.202 L -15.106 -30.165 L 8.767 -30.165 L 8.767 -25.4 C 8.767 -22.191, 7.815 -19.689, 5.908 -17.894 C 4.002 -16.1, 1.35 -15.202, -2.049 -15.202 M 8.767 -25.114 L 3.43 -25.114 C 1.079 -25.114, -0.715 -25.344, -1.955 -25.804 C -3.193 -26.265, -4.496 -27.179, -5.862 -28.544 L -7.434 -30.117 C -8.8 -31.483, -10.0 -32.397, -11.032 -32.857 C -12.065 -33.318, -13.422 -33.548, -15.106 -33.548 L -23.494 -33.548 L -23.494 -38.599 L -15.106 -38.599 C -12.565 -38.599, -10.643 -38.369, -9.34 -37.909 C -8.037 -37.448, -6.705 -36.534, -5.338 -35.168 L -3.764 -33.596 C -2.4 -32.23, -1.232 -31.316, -0.263 -30.856 C 0.706 -30.396, 1.936 -30.165, 3.43 -30.165 L 8.767 -30.165 Z M -23.494 -38.599 L -18.490000000000002 -38.599 L -18.490000000000002 -0.47699999999999676 L -23.494 -0.47699999999999676 Z M -23.494 -0.477 M -31.595 -17.918 L -26.115 -23.398 L -31.595 -28.83 L -37.074 -23.398 Z M -42.602 -10.151 L -50.513 -38.599 L -47.987 -38.599 C -46.431 -38.599, -45.025 -38.242, -43.771 -37.527 C -42.516 -36.813, -41.53 -35.828, -40.815 -34.572 C -40.101 -33.318, -39.744 -31.912, -39.744 -30.355 L -39.744 -15.202 L -23.017 -15.202 L -23.017 -10.151 Z M -45.223 0.0 L -39.744 -5.48 L -45.223 -10.913 L -50.703 -5.48 Z" fill="black" stroke="none" stroke-width="1" />
</g>
<g>
<g transform="matrix(1.0 0.0 0.0 1.0 87.8656 63.434)">
<path d="M 0.0 0.0 C 2.726 -1.336, 8.398 -2.336, 12.182 -2.336 C 14.295 -2.336, 15.462 -1.723, 15.462 -0.779 C 15.462 0.779, 11.403 0.89, 6.897 2.28 C 2.113 3.782, -0.5 5.895, -0.5 12.124 C -0.5 19.353, 5.951 23.358, 13.349 23.358 C 17.909 23.358, 22.359 22.245, 24.527 21.132 L 24.527 12.513 C 23.081 13.347, 18.409 14.57, 14.849 14.57 C 12.457 14.57, 10.069 14.181, 10.069 12.791 C 10.069 11.845, 11.403 11.234, 15.35 10.455 C 20.301 9.454, 25.861 7.341, 25.861 0.444 C 25.861 -7.785, 19.134 -10.567, 10.844 -10.567 C 7.177 -10.567, 3.559 -9.844, 0.0 -8.454 Z" fill="black" stroke="none" stroke-width="1" />
</g>
<g>
<g transform="matrix(1.0 0.0 0.0 1.0 118.1887 65.4365)">
<path d="M 0.0 0.0 L 0.0 20.632 L 11.624 20.632 L 11.624 2.336 C 11.624 -2.446, 12.957 -4.339, 16.85 -4.339 C 19.967 -4.339, 21.58 -2.669, 21.58 2.39 L 21.58 20.632 L 33.2 20.632 L 33.2 1.5 C 33.2 -8.287, 26.14 -12.57, 16.517 -12.57 C 6.006 -12.57, 0.0 -8.175, 0.0 0.0" fill="black" stroke="none" stroke-width="1" />
</g>
<g>
<g transform="matrix(1.0 0.0 0.0 1.0 157.4797 86.0687)">
<path d="M 0.0 0.0 L 11.624 0.0 L 11.624 -23.914 L 23.414 -23.914 L 23.414 -32.423 L 0.0 -32.423 Z" fill="black" stroke="none" stroke-width="1" />
</g>
<g>
<g transform="matrix(1.0 0.0 0.0 1.0 177.7645 86.0687)">
<path d="M 0.0 0.0 L 31.312 0.0 L 31.312 -8.508 L 21.355 -8.508 L 21.355 -32.423 L 9.732 -32.423 L 9.732 -8.508 L 0.0 -8.508 Z" fill="black" stroke="none" stroke-width="1" />
</g>
<g>
<g transform="matrix(1.0 0.0 0.0 1.0 221.3629 67.2162)">
<path d="M 0.0 0.0 L 5.506 0.0 L 5.118 1.446 L 3.226 8.398 L 2.947 8.398 L 0.5 1.334 Z M -2.225 18.853 L 10.232 18.853 L 21.41 -13.57 L 9.231 -13.57 L 7.785 -8.454 L -2.892 -8.454 L -4.614 -13.57 L -15.462 -13.57 Z" fill="black" stroke="none" stroke-width="1" />
</g>
<g>
<g transform="matrix(1.0 0.0 0.0 1.0 246.006 86.0688)">
<path d="M 0.0 0.0 L 9.177 0.0 L 22.747 -14.349 L 23.081 -14.349 L 23.081 0.0 L 33.091 0.0 L 33.091 -32.423 L 23.635 -32.423 L 10.232 -17.909 L 9.957 -17.909 L 9.957 -32.423 L 0.0 -32.423 Z" fill="black" stroke="none" stroke-width="1" />
</g>
<g>
<g transform="matrix(1.0 0.0 0.0 1.0 294.7752 67.55)">
<path d="M 0.0 0.0 L 0.0 -8.12 L 0.779 -8.12 C 2.113 -8.12, 2.781 -7.119, 2.781 -3.728 C 2.781 -1.112, 2.168 0.0, 0.779 0.0 Z M 0.0 12.792 L 0.0 4.894 L 0.502 4.894 C 1.723 4.894, 2.225 6.397, 2.225 8.622 C 2.225 12.067, 1.557 12.792, 0.388 12.792 Z M -6.229 18.519 L 1.392 18.519 C 6.118 18.519, 8.565 15.795, 8.565 11.069 C 8.565 6.728, 7.176 4.338, 4.17 3.337 L 4.17 3.226 C 6.731 2.838, 9.121 1.001, 9.121 -4.672 C 9.121 -10.011, 6.451 -13.904, 1.668 -13.904 L -6.229 -13.904 Z" fill="black" stroke="none" stroke-width="1" />
</g>
<g>
<g transform="matrix(1.0 0.0 0.0 1.0 316.2513 65.8247)">
<path d="M 0.0 0.0 L 2.338 0.0 L 1.948 5.453 L 1.449 12.794 L 1.112 12.794 L 0.502 5.507 Z M -2.724 20.244 L 5.618 20.244 L 9.68 -12.179 L 3.283 -12.179 L 2.783 -5.727 L -0.554 -5.727 L -1.167 -12.179 L -7.507 -12.179 Z" fill="black" stroke="none" stroke-width="1" />
</g>
<g>
<g transform="matrix(1.0 0.0 0.0 1.0 331.9381 86.0688)">
<path d="M 0.0 0.0 L 6.229 0.0 L 6.229 -15.515 L 9.845 0.0 L 15.572 0.0 L 11.902 -14.292 L 15.629 -32.423 L 9.4 -32.423 L 6.229 -16.462 L 6.229 -32.423 L 0.0 -32.423 Z" fill="black" stroke="none" stroke-width="1" />
</g>
<g>
<g transform="matrix(1.0 0.0 0.0 1.0 353.5772 86.0688)">
<path d="M 0.0 0.0 L 12.569 0.0 L 12.569 -6.115 L 6.229 -6.115 L 6.229 -13.125 L 11.736 -13.125 L 11.736 -18.796 L 6.229 -18.796 L 6.229 -26.251 L 12.68 -26.251 L 12.68 -32.423 L 0.0 -32.423 Z" fill="black" stroke="none" stroke-width="1" />
</g>
<g>
<g transform="matrix(1.0 0.0 0.0 1.0 379.0343 80.3417)">
<path d="M 0.0 0.0 L 0.0 -10.621 L 0.057 -10.621 C 1.557 -10.621, 2.39 -10.176, 2.39 -5.174 C 2.39 -1.224, 2.002 0.0, 0.166 0.0 Z M -6.229 5.727 L 1.055 5.727 C 6.674 5.727, 8.733 2.447, 8.733 -5.174 C 8.733 -8.787, 7.729 -11.511, 6.286 -13.348 L 9.343 -26.696 L 3.114 -26.696 L 1.169 -16.351 L 0.833 -16.351 L 0.0 -16.351 L 0.0 -26.696 L -6.229 -26.696 Z" fill="black" stroke="none" stroke-width="1" />
</g>
<g>
<g transform="matrix(1.0 0.0 0.0 1.0 397.996 64.5468)">
<path d="M 0.0 0.0 L -5.505 21.522 L 1.28 21.522 L 2.393 13.681 L 3.114 7.564 L 3.337 7.564 L 4.061 13.681 L 5.174 21.522 L 11.568 21.522 L 6.229 -0.556 L 6.229 -10.901 L 0.0 -10.901 Z" fill="black" stroke="none" stroke-width="1" />
</g>
<g>
<g transform="matrix(1.0 0.0 0.0 1.0 58.9217 79.6154)">
<path d="M 0.0 0.0 L 0.0 -10.473 L 2.453 -10.473 C 2.471 -10.437, 2.527 -10.337, 2.619 -10.174 C 2.672 -10.047, 2.755 -9.928, 2.865 -9.819 C 2.971 -9.709, 3.11 -9.615, 3.273 -9.532 C 3.436 -9.452, 3.637 -9.41, 3.874 -9.41 C 4.255 -9.41, 4.569 -9.547, 4.815 -9.819 C 5.06 -10.091, 5.182 -10.42, 5.182 -10.801 L 5.182 -15.356 C 5.182 -15.808, 5.069 -16.164, 4.841 -16.418 C 4.613 -16.673, 4.291 -16.8, 3.874 -16.8 C 3.453 -16.8, 3.113 -16.67, 2.85 -16.406 C 2.586 -16.143, 2.453 -15.773, 2.453 -15.299 L 2.453 -14.592 L -0.328 -14.592 L -0.328 -15.409 C -0.328 -16.063, -0.213 -16.646, 0.015 -17.155 C 0.24 -17.664, 0.544 -18.102, 0.926 -18.463 C 1.308 -18.827, 1.749 -19.105, 2.249 -19.297 C 2.749 -19.487, 3.273 -19.582, 3.817 -19.582 C 4.362 -19.582, 4.886 -19.487, 5.386 -19.297 C 5.886 -19.105, 6.327 -18.827, 6.709 -18.463 C 7.09 -18.102, 7.395 -17.664, 7.623 -17.155 C 7.851 -16.646, 7.963 -16.063, 7.963 -15.409 L 7.963 -10.393 C 7.963 -9.245, 7.667 -8.387, 7.076 -7.815 C 6.487 -7.241, 5.717 -6.954, 4.773 -6.954 C 4.282 -6.954, 3.835 -7.043, 3.436 -7.215 C 3.036 -7.386, 2.708 -7.599, 2.453 -7.854 L 2.453 -2.619 L 7.963 -2.619 L 7.963 0.0 Z M -8.002 -19.419 L -3.285 -2.782 L -3.285 0.0 L -11.577 0.0 L -11.577 -4.856 L -9.12 -4.856 L -9.12 -2.619 L -6.067 -2.619 L -10.949 -19.419 Z M -20.182 -4.01 C -20.182 -3.593, -20.046 -3.255, -19.771 -3.001 C -19.499 -2.746, -19.182 -2.619, -18.818 -2.619 C -18.454 -2.619, -18.134 -2.746, -17.862 -3.001 C -17.59 -3.255, -17.454 -3.593, -17.454 -4.01 L -17.454 -7.608 C -17.454 -8.029, -17.59 -8.363, -17.862 -8.617 C -18.134 -8.875, -18.454 -8.999, -18.818 -8.999 C -19.182 -8.999, -19.499 -8.875, -19.771 -8.617 C -20.046 -8.363, -20.182 -8.029, -20.182 -7.608 Z M -18.845 -19.419 L -15.19 -9.656 C -15.098 -9.402, -15.021 -9.159, -14.959 -8.931 C -14.894 -8.706, -14.835 -8.446, -14.782 -8.156 C -14.746 -7.884, -14.716 -7.552, -14.699 -7.158 C -14.681 -6.768, -14.672 -6.274, -14.672 -5.673 C -14.672 -5.037, -14.681 -4.513, -14.699 -4.105 C -14.716 -3.696, -14.746 -3.347, -14.782 -3.054 C -14.835 -2.782, -14.909 -2.545, -15.001 -2.347 C -15.089 -2.145, -15.199 -1.938, -15.326 -1.719 C -15.69 -1.136, -16.172 -0.678, -16.773 -0.34 C -17.371 -0.006, -18.055 0.163, -18.818 0.163 C -19.582 0.163, -20.268 0.0, -20.878 -0.328 C -21.487 -0.654, -21.973 -1.119, -22.337 -1.719 C -22.464 -1.938, -22.567 -2.145, -22.65 -2.347 C -22.73 -2.545, -22.789 -2.782, -22.828 -3.054 C -22.881 -3.347, -22.917 -3.696, -22.934 -4.105 C -22.955 -4.513, -22.964 -5.037, -22.964 -5.673 C -22.964 -6.436, -22.955 -7.07, -22.934 -7.57 C -22.917 -8.07, -22.881 -8.481, -22.828 -8.81 C -22.789 -9.138, -22.736 -9.405, -22.662 -9.615 C -22.591 -9.825, -22.49 -10.02, -22.363 -10.201 C -22.126 -10.565, -21.801 -10.863, -21.381 -11.1 C -20.964 -11.337, -20.508 -11.455, -20.017 -11.455 C -19.709 -11.455, -19.457 -11.432, -19.268 -11.387 C -19.075 -11.343, -18.936 -11.284, -18.845 -11.21 L -18.791 -11.263 L -21.955 -19.419 Z M -27.219 -19.419 L -27.219 0.0 L -30.004 0.0 L -32.786 -2.045 L -32.786 -4.992 L -30.004 -2.947 L -30.004 -19.419 Z M -12.391 -30.131 L -12.391 -30.132 C -12.397 -30.132, -12.403 -30.132, -12.411 -30.132 C -12.419 -30.132, -12.425 -30.132, -12.433 -30.132 L -12.433 -30.131 C -33.968 -30.116, -46.036 -19.95, -46.036 -9.709 C -46.036 0.532, -33.968 10.698, -12.433 10.712 L -12.433 10.713 C -12.425 10.713, -12.419 10.713, -12.411 10.713 C -12.403 10.713, -12.397 10.713, -12.391 10.713 L -12.391 10.712 C 9.374 10.698, 21.213 0.532, 21.213 -9.709 C 21.213 -19.951, 9.374 -30.116, -12.391 -30.131" fill="black" stroke="none" stroke-width="1" />
</g>
</g>
</g>
</g>
</g>
</g>
</g>
</g>
</g>
</g>
</g>
</g>
</g>
</g>
</g>
</g>
</g>
</svg>"""

# ── Shared style ─────────────────────────────────────────────────────────────
_BASE_CSS = """<style>
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Tajawal:wght@300;400;500;700;900&display=swap');

* { box-sizing: border-box; margin: 0; padding: 0; }
body, html { 
    width: 72mm; 
    font-size: 11px; 
    color: #111; 
    background: #fff; 
    font-family: 'Outfit', 'Tajawal', sans-serif;
    line-height: 1.5;
    position: relative;
}
@page { size: 80mm auto; margin: 4mm 2mm; }

.center { text-align: center; }
.bold   { font-weight: 700; }
.medium { font-weight: 500; }
.small  { font-size: 9px; color: #666; }
.lg     { font-size: 13px; }
.xl     { font-size: 16px; }

.divider { 
    border-top: 1px dashed #aaa; 
    margin: 8px 0; 
}
.solid  { 
    border-top: 1px solid #111; 
    margin: 8px 0; 
}
.double {
    border-top: 3px double #111;
    margin: 8px 0;
}

table   { width: 100%; border-collapse: collapse; }
td, th  { padding: 4px 2px; vertical-align: top; }
th      { font-weight: 700; border-bottom: 1.5px solid #111; font-size: 10px; color: #333; }
.r { text-align: right; }
.c { text-align: center; }

.logo-container {
    text-align: center;
    margin-bottom: 12px;
}

.receipt-title {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.5px;
    margin: 4px 0;
    text-transform: uppercase;
    color: #444;
}

.meta-info {
    font-size: 10px;
    line-height: 1.6;
}
.meta-info td {
    padding: 2px 0;
}
.meta-label {
    color: #666;
}

.item-table th {
    padding-bottom: 6px;
    text-transform: uppercase;
}
.item-table td {
    font-size: 10.5px;
    padding: 5px 2px;
}
.item-name {
    font-weight: 500;
    color: #111;
}

.totals-table td {
    padding: 4px 2px;
    font-size: 11px;
}
.grand td { 
    font-size: 14px; 
    font-weight: 700; 
    padding-top: 6px;
}

.payment-table td {
    font-size: 10px;
    padding: 3px 2px;
}

.footer-msg {
    font-size: 10px;
    font-weight: 500;
    margin-top: 10px;
    color: #555;
    line-height: 1.5;
}
.watermark {
    position: absolute;
    top: 40%;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 45px;
    color: rgba(0, 0, 0, 0.06);
    font-weight: 900;
    transform: rotate(-25deg);
    z-index: 1000;
    pointer-events: none;
    user-select: none;
    white-space: nowrap;
}
</style>"""

# ── Template 1: Sultan Thermal Standard ─────────────────────────────────────
_STANDARD_HTML = """__CSS__

<div class="logo-container">
  {{ LOGO_SQUARE }}
  <div class="small" style="margin-top:6px;">{% if doc.tax_id %}VAT No: {{ doc.tax_id }}{% endif %}</div>
</div>

{% if doc.docstatus == 0 %}
<div class="watermark">DRAFT / مسودة</div>
{% endif %}

<div class="divider"></div>

<div class="center">
  <div class="bold lg" style="letter-spacing: 0.5px;">{{ doc.name }}</div>
</div>

<div class="divider"></div>

<div class="meta-info">
  <table>
    <tr>
      <td class="meta-label">Date / التاريخ:</td>
      <td class="r bold">{{ doc.posting_date }} {{ (doc.posting_time | string).split(".")[0] }}</td>
    </tr>
    {% set cashier = frappe.db.get_value("POS Opening Entry", doc.custom_pos_opening_entry, "custom_employee_name") if doc.custom_pos_opening_entry else None %}
    <tr>
      <td class="meta-label">Cashier / الكاشير:</td>
      <td class="r bold">{{ cashier or frappe.db.get_value("User", doc.owner, "full_name") or doc.owner }}</td>
    </tr>
    <tr>
      <td class="meta-label">Customer / العميل:</td>
      <td class="r bold">{{ doc.customer_name or doc.customer }}</td>
    </tr>
  </table>
</div>

<div class="divider"></div>

<table class="item-table">
  <thead><tr>
    <th style="width:45%; text-align: left;">Item / الصنف</th>
    <th class="c" style="width:15%">Qty</th>
    <th class="r" style="width:20%">Price</th>
    <th class="r" style="width:20%">Total</th>
  </tr></thead>
  <tbody>
    {% for item in doc.items %}
    <tr style="border-bottom: 1px solid #eee;">
      <td>
        <div class="item-name">{{ item.item_name or item.item_code }}</div>
        {% if item.description and item.description != item.item_name %}
        <div class="small">{{ item.description }}</div>
        {% endif %}
      </td>
      <td class="c bold" style="vertical-align: middle;">{{ item.qty | int }}</td>
      <td class="r bold" style="vertical-align: middle;">{{ "{:,.2f}".format(item.rate or 0) }}</td>
      <td class="r bold" style="vertical-align: middle;">{{ "{:,.2f}".format(item.amount or 0) }}</td>
    </tr>
    {% endfor %}
  </tbody>
</table>

<div class="solid"></div>

<table class="totals-table">
  <tr><td>Subtotal / المجموع</td><td class="r bold">{{ "{:,.2f}".format(doc.net_total or 0) }}</td></tr>
  {% for tax in doc.taxes %}
  <tr><td>{{ tax.description or tax.account_head }} ({{ tax.rate }}%)</td><td class="r bold">{{ "{:,.2f}".format(tax.tax_amount or 0) }}</td></tr>
  {% endfor %}
  {% if doc.discount_amount %}
  <tr><td>Discount / خصم</td><td class="r bold" style="color: red;">-{{ "{:,.2f}".format(doc.discount_amount) }}</td></tr>
  {% endif %}
  <tr class="grand">
    <td style="border-top: 1.5px solid #111; padding-top: 6px;">TOTAL / الإجمالي {{ doc.currency }}</td>
    <td class="r bold" style="border-top: 1.5px solid #111; padding-top: 6px; font-size: 15px;">{{ "{:,.2f}".format(doc.grand_total or 0) }}</td>
  </tr>
</table>

{% if doc.payments %}
<div class="divider"></div>
<table class="payment-table">
  {% set total_paid = doc.payments | map(attribute='amount') | sum %}
  {% for p in doc.payments %}
  {% set show_payment = false %}
  {% set print_amount = 0 %}
  {% if p.amount and p.amount > 0 %}
    {% set show_payment = true %}
    {% set print_amount = p.amount %}
  {% elif total_paid == 0 and (p.default or doc.payments|length == 1) %}
    {% set show_payment = true %}
    {% set print_amount = doc.grand_total %}
  {% endif %}
  {% if show_payment %}
    {% if "cash" in pm|lower %}{% set pm = "Cash / كاش" %}{% elif "card" in pm|lower or "visa" in pm|lower or "bank" in pm|lower %}{% set pm = "Bank / البنك" %}{% endif %}
    {% if p.custom_payment_original_amount and p.custom_payment_currency %}
      <tr><td>{{ pm }}</td><td class="r bold">{{ "{:,.2f}".format(p.custom_payment_original_amount) }} {{ p.custom_payment_currency }}</td></tr>
    {% else %}
      <tr><td>{{ pm }}</td><td class="r bold">{{ "{:,.2f}".format(print_amount or 0) }} {{ doc.currency }}</td></tr>
    {% endif %}
  {% endif %}
  {% endfor %}
</table>
{% endif %}

<div class="divider"></div>

<div class="center" style="margin: 12px 0;">
  <img src="https://barcode.orcascan.com/?type=code128&data={{ doc.name }}" style="width: 50mm; height: 12mm; display: block; margin: 0 auto;" />
  <div style="font-family: monospace; font-size: 10px; margin-top: 4px; letter-spacing: 1px;">{{ doc.name }}</div>
</div>

<div class="divider"></div>

{% if doc.custom_qr_code %}
<div class="center" style="margin:8px 0">
  <img src="{{ doc.custom_qr_code }}" style="width:32mm;height:32mm" />
</div>
<div class="divider"></div>
{% endif %}

<div class="center footer-msg">
  <div class="bold">Thank you for your visit!</div>
  <div class="bold" style="margin-top:2px">شكراً لزيارتكم</div>
</div>"""

# ── Template 2: Sultan Thermal Standard EN ──────────────────────────────────
_STANDARD_EN_HTML = """__CSS__

<div class="logo-container">
  {{ LOGO_SQUARE }}
  <div class="small" style="margin-top:6px;">{% if doc.tax_id %}VAT No: {{ doc.tax_id }}{% endif %}</div>
</div>

{% if doc.docstatus == 0 %}
<div class="watermark">DRAFT</div>
{% endif %}

<div class="divider"></div>
<div class="center">
  <div class="bold lg" style="letter-spacing: 0.5px;">{{ doc.name }}</div>
</div>
<div class="divider"></div>
<div class="meta-info">
  <table>
    <tr><td class="meta-label">Date:</td><td class="r bold">{{ doc.posting_date }} {{ (doc.posting_time | string).split(".")[0] }}</td></tr>
    {% set cashier = frappe.db.get_value("POS Opening Entry", doc.custom_pos_opening_entry, "custom_employee_name") if doc.custom_pos_opening_entry else None %}
    <tr><td class="meta-label">Cashier:</td><td class="r bold">{{ cashier or frappe.db.get_value("User", doc.owner, "full_name") or doc.owner }}</td></tr>
    <tr><td class="meta-label">Customer:</td><td class="r bold">{{ doc.customer_name or doc.customer }}</td></tr>
  </table>
</div>
<div class="divider"></div>
<table class="item-table">
  <thead><tr><th style="width:50%; text-align: left;">Item</th><th class="c" style="width:15%">Qty</th><th class="r" style="width:17%">Price</th><th class="r" style="width:18%">Total</th></tr></thead>
  <tbody>
    {% for item in doc.items %}
    <tr style="border-bottom: 1px solid #eee;">
      <td>
        <div class="item-name">{{ item.item_name or item.item_code }}</div>
      </td>
      <td class="c bold">{{ item.qty | int }}</td>
      <td class="r bold">{{ "{:,.2f}".format(item.rate or 0) }}</td>
      <td class="r bold">{{ "{:,.2f}".format(item.amount or 0) }}</td>
    </tr>
    {% endfor %}
  </tbody>
</table>
<div class="solid"></div>
<table class="totals-table">
  <tr><td>Subtotal</td><td class="r bold">{{ "{:,.2f}".format(doc.net_total or 0) }}</td></tr>
  {% for tax in doc.taxes %}<tr><td>{{ tax.description or tax.account_head }} ({{ tax.rate }}%)</td><td class="r bold">{{ "{:,.2f}".format(tax.tax_amount or 0) }}</td></tr>{% endfor %}
  {% if doc.discount_amount %}<tr><td>Discount</td><td class="r bold" style="color: red;">-{{ "{:,.2f}".format(doc.discount_amount) }}</td></tr>{% endif %}
  <tr class="grand">
    <td style="border-top: 1.5px solid #111; padding-top: 6px;">TOTAL {{ doc.currency }}</td>
    <td class="r bold" style="border-top: 1.5px solid #111; padding-top: 6px; font-size: 15px;">{{ "{:,.2f}".format(doc.grand_total or 0) }}</td>
  </tr>
</table>
{% if doc.payments %}
<div class="divider"></div>
<table class="payment-table">
  {% set total_paid = doc.payments | map(attribute='amount') | sum %}
  {% for p in doc.payments %}
  {% set show_payment = false %}
  {% set print_amount = 0 %}
  {% if p.amount and p.amount > 0 %}
    {% set show_payment = true %}
    {% set print_amount = p.amount %}
  {% elif total_paid == 0 and (p.default or doc.payments|length == 1) %}
    {% set show_payment = true %}
    {% set print_amount = doc.grand_total %}
  {% endif %}
  {% if show_payment %}
    {% set pm = p.mode_of_payment %}
    {% if "cash" in pm|lower %}{% set pm = "Cash" %}{% elif "card" in pm|lower or "visa" in pm|lower or "bank" in pm|lower %}{% set pm = "Bank" %}{% endif %}
    {% if p.custom_payment_original_amount and p.custom_payment_currency %}
      <tr><td>Payment Method: <span class="bold">{{ pm }}</span></td><td class="r bold">{{ "{:,.2f}".format(p.custom_payment_original_amount) }} {{ p.custom_payment_currency }}</td></tr>
    {% else %}
      <tr><td>Payment Method: <span class="bold">{{ pm }}</span></td><td class="r bold">{{ "{:,.2f}".format(print_amount or 0) }} {{ doc.currency }}</td></tr>
    {% endif %}
  {% endif %}
  {% endfor %}
</table>
{% endif %}

<div class="divider"></div>

<div class="center" style="margin: 12px 0;">
  <img src="https://barcode.orcascan.com/?type=code128&data={{ doc.name }}" style="width: 50mm; height: 12mm; display: block; margin: 0 auto;" />
  <div style="font-family: monospace; font-size: 10px; margin-top: 4px; letter-spacing: 1px;">{{ doc.name }}</div>
</div>

<div class="divider"></div>

{% if doc.custom_qr_code %}<div class="center" style="margin:6px 0"><img src="{{ doc.custom_qr_code }}" style="width:32mm;height:32mm" /></div><div class="divider"></div>{% endif %}
<div class="center footer-msg"><div>Thank you for your visit!</div></div>"""

# ── Template 3: Sultan Thermal Standard AR ──────────────────────────────────
_STANDARD_AR_HTML = """__CSS__
<style>body, html { direction: rtl; } .en { direction:ltr; unicode-bidi:embed; } td, th { text-align:right; } .r { text-align:left; } .c { text-align:center; }</style>

<div class="logo-container">
  {{ LOGO_SQUARE }}
  {% if doc.tax_id %}<div class="small" style="margin-top: 6px;">الرقم الضريبي: <span class="en">{{ doc.tax_id }}</span></div>{% endif %}
</div>

{% if doc.docstatus == 0 %}
<div class="watermark">مسودة</div>
{% endif %}

<div class="divider"></div>
<div class="center">
  <div class="bold lg en">{{ doc.name }}</div>
</div>
<div class="divider"></div>
<div class="meta-info">
  <table>
    <tr><td>التاريخ:</td><td class="r en bold">{{ doc.posting_date }} {{ (doc.posting_time | string).split(".")[0] }}</td></tr>
    {% set cashier = frappe.db.get_value("POS Opening Entry", doc.custom_pos_opening_entry, "custom_employee_name") if doc.custom_pos_opening_entry else None %}
    <tr><td>الكاشير:</td><td class="r bold">{{ cashier or frappe.db.get_value("User", doc.owner, "full_name") or doc.owner }}</td></tr>
    <tr><td>العميل:</td><td class="r bold">{{ doc.customer_name or doc.customer }}</td></tr>
  </table>
</div>
<div class="divider"></div>
<table class="item-table">
  <thead><tr><th style="width:50%; text-align: right;">الصنف</th><th class="c" style="width:15%">الكمية</th><th class="r" style="width:17%">السعر</th><th class="r" style="width:18%">الإجمالي</th></tr></thead>
  <tbody>
    {% for item in doc.items %}
    <tr style="border-bottom: 1px solid #eee;">
      <td>
        <div class="item-name">{{ item.item_name or item.item_code }}</div>
      </td>
      <td class="c en bold">{{ item.qty | int }}</td>
      <td class="r en bold">{{ "{:,.2f}".format(item.rate or 0) }}</td>
      <td class="r en bold">{{ "{:,.2f}".format(item.amount or 0) }}</td>
    </tr>
    {% endfor %}
  </tbody>
</table>
<div class="solid"></div>
<table class="totals-table">
  <tr><td>المجموع الفرعي</td><td class="r en bold">{{ "{:,.2f}".format(doc.net_total or 0) }}</td></tr>
  {% for tax in doc.taxes %}<tr><td>{{ tax.description or "ضريبة" }} ({{ tax.rate }}%)</td><td class="r en bold">{{ "{:,.2f}".format(tax.tax_amount or 0) }}</td></tr>{% endfor %}
  {% if doc.discount_amount %}<tr><td>خصم</td><td class="r en bold">-{{ "{:,.2f}".format(doc.discount_amount) }}</td></tr>{% endif %}
  <tr class="grand">
    <td style="border-top: 1.5px solid #111; padding-top: 6px;">الإجمالي {{ doc.currency }}</td>
    <td class="r en bold" style="border-top: 1.5px solid #111; padding-top: 6px; font-size: 15px;">{{ "{:,.2f}".format(doc.grand_total or 0) }}</td>
  </tr>
</table>
{% if doc.payments %}
<div class="divider"></div>
<table class="payment-table">
  {% set total_paid = doc.payments | map(attribute='amount') | sum %}
  {% for p in doc.payments %}
  {% set show_payment = false %}
  {% set print_amount = 0 %}
  {% if p.amount and p.amount > 0 %}
    {% set show_payment = true %}
    {% set print_amount = p.amount %}
  {% elif total_paid == 0 and (p.default or doc.payments|length == 1) %}
    {% set show_payment = true %}
    {% set print_amount = doc.grand_total %}
  {% endif %}
  {% if show_payment %}
    {% set pm = p.mode_of_payment %}
    {% if "cash" in pm|lower %}{% set pm = "كاش" %}{% elif "card" in pm|lower or "visa" in pm|lower or "bank" in pm|lower %}{% set pm = "البنك" %}{% endif %}
    {% if p.custom_payment_original_amount and p.custom_payment_currency %}
      <tr><td>طريقة الدفع: <span class="bold">{{ pm }}</span></td><td class="r en bold">{{ "{:,.2f}".format(p.custom_payment_original_amount) }} {{ p.custom_payment_currency }}</td></tr>
    {% else %}
      <tr><td>طريقة الدفع: <span class="bold">{{ pm }}</span></td><td class="r en bold">{{ "{:,.2f}".format(print_amount or 0) }} {{ doc.currency }}</td></tr>
    {% endif %}
  {% endif %}
  {% endfor %}
</table>
{% endif %}

<div class="divider"></div>

<div class="center" style="margin: 12px 0;">
  <img src="https://barcode.orcascan.com/?type=code128&data={{ doc.name }}" style="width: 50mm; height: 12mm; display: block; margin: 0 auto;" />
  <div style="font-family: monospace; font-size: 10px; margin-top: 4px; letter-spacing: 1px;" class="en">{{ doc.name }}</div>
</div>

<div class="divider"></div>

{% if doc.custom_qr_code %}<div class="center" style="margin:6px 0"><img src="{{ doc.custom_qr_code }}" style="width:32mm;height:32mm" /></div><div class="divider"></div>{% endif %}
<div class="center footer-msg"><div>شكراً لزيارتكم</div></div>"""

# ── Template 4: Sultan Thermal Compact ──────────────────────────────────────
_COMPACT_HTML = """__CSS__

<div class="logo-container">
  {{ LOGO_SQUARE }}
  <div class="small" style="margin-top:4px">{{ doc.name }} | {{ doc.posting_date }}</div>
  <div class="small">Customer: {{ doc.customer_name or doc.customer }}</div>
</div>

{% if doc.docstatus == 0 %}
<div class="watermark" style="font-size: 35px; top: 35%;">DRAFT / مسودة</div>
{% endif %}

<div class="divider"></div>

<table style="font-size:10px">
  {% for item in doc.items %}
  <tr>
    <td><span class="bold">{{ item.item_name or item.item_code }}</span> x{{ item.qty | int }}</td>
    <td class="r">{{ "{:,.2f}".format(item.amount or 0) }}</td>
  </tr>
  {% endfor %}
</table>

<div class="solid"></div>

<table>
  <tr><td>Net / صافي</td><td class="r">{{ "{:,.2f}".format(doc.net_total or 0) }}</td></tr>
  {% for tax in doc.taxes %}
  <tr><td>VAT {{ tax.rate }}%</td><td class="r">{{ "{:,.2f}".format(tax.tax_amount or 0) }}</td></tr>
  {% endfor %}
  <tr class="grand"><td>TOTAL {{ doc.currency }}</td><td class="r">{{ "{:,.2f}".format(doc.grand_total or 0) }}</td></tr>
</table>

{% if doc.payments %}
<div class="small center" style="margin-top:3px">
  {% for p in doc.payments %}{{ p.mode_of_payment }}: {{ "{:,.2f}".format(p.amount or 0) }}  {% endfor %}
</div>
{% endif %}

<div class="divider"></div>

<div class="center" style="margin: 8px 0;">
  <img src="https://barcode.orcascan.com/?type=code128&data={{ doc.name }}" style="width: 45mm; height: 10mm; display: block; margin: 0 auto;" />
</div>

<div class="divider"></div>
<div class="center small">Thank you / شكراً!</div>"""

# ── Template 5: Sultan Thermal Bilingual (Arabic + English) ─────────────────
_BILINGUAL_HTML = """__CSS__
<style>.ar{direction:rtl;text-align:right}.split{display:flex;justify-content:space-between}</style>

<div class="logo-container">
  {{ LOGO_SQUARE }}
  <div class="small" style="margin-top:6px;">{{ doc.name }} | {{ doc.posting_date }} {{ (doc.posting_time | string).split(".")[0] }}</div>
</div>

{% if doc.docstatus == 0 %}
<div class="watermark">DRAFT / مسودة</div>
{% endif %}

<div class="divider"></div>

<div class="split small">
  <span>Customer: {{ doc.customer_name or doc.customer }}</span>
  <span class="ar">العميل: {{ doc.customer_name or doc.customer }}</span>
</div>

<div class="divider"></div>

<table class="item-table">
  <thead><tr>
    <th style="width:50%; text-align: left;">Item / الصنف</th>
    <th class="c" style="width:20%">Qty / الكمية</th>
    <th class="r" style="width:30%">Amount / القيمة</th>
  </tr></thead>
  <tbody>
    {% for item in doc.items %}
    <tr style="border-bottom: 1px solid #eee;">
      <td>
        <div class="item-name">{{ item.item_name or item.item_code }}</div>
        {% if item.description and item.description != item.item_name %}
        <div class="small">{{ item.description }}</div>
        {% endif %}
      </td>
      <td class="c bold" style="vertical-align: middle;">{{ item.qty | int }}</td>
      <td class="r bold" style="vertical-align: middle;">{{ "{:,.2f}".format(item.amount or 0) }}</td>
    </tr>
    {% endfor %}
  </tbody>
</table>

<div class="solid"></div>

<table class="totals-table">
  <tr><td>Subtotal / المجموع الجزئي</td><td class="r bold">{{ "{:,.2f}".format(doc.net_total or 0) }}</td></tr>
  {% for tax in doc.taxes %}
  <tr><td>{{ tax.description or "VAT" }} / ضريبة ({{ tax.rate }}%)</td><td class="r bold">{{ "{:,.2f}".format(tax.tax_amount or 0) }}</td></tr>
  {% endfor %}
  {% if doc.discount_amount %}
  <tr><td>Discount / خصم</td><td class="r bold" style="color: red;">-{{ "{:,.2f}".format(doc.discount_amount) }}</td></tr>
  {% endif %}
  <tr class="grand">
    <td style="border-top: 1.5px solid #111; padding-top: 6px;">TOTAL / الإجمالي {{ doc.currency }}</td>
    <td class="r bold" style="border-top: 1.5px solid #111; padding-top: 6px; font-size: 15px;">{{ "{:,.2f}".format(doc.grand_total or 0) }}</td>
  </tr>
</table>

{% if doc.payments %}
<div class="divider"></div>
<table class="payment-table">
  {% set total_paid = doc.payments | map(attribute='amount') | sum %}
  {% for p in doc.payments %}
  {% set show_payment = false %}
  {% set print_amount = 0 %}
  {% if p.amount and p.amount > 0 %}
    {% set show_payment = true %}
    {% set print_amount = p.amount %}
  {% elif total_paid == 0 and (p.default or doc.payments|length == 1) %}
    {% set show_payment = true %}
    {% set print_amount = doc.grand_total %}
  {% endif %}
  {% if show_payment %}
    {% if "cash" in pm|lower %}{% set pm = "Cash / كاش" %}{% elif "card" in pm|lower or "visa" in pm|lower or "bank" in pm|lower %}{% set pm = "Bank / البنك" %}{% endif %}
    {% if p.custom_payment_original_amount and p.custom_payment_currency %}
      <tr><td>{{ pm }}</td><td class="r bold">{{ "{:,.2f}".format(p.custom_payment_original_amount) }} {{ p.custom_payment_currency }}</td></tr>
    {% else %}
      <tr><td>{{ pm }}</td><td class="r bold">{{ "{:,.2f}".format(print_amount or 0) }} {{ doc.currency }}</td></tr>
    {% endif %}
  {% endif %}
  {% endfor %}
</table>
{% endif %}

<div class="divider"></div>

<div class="center" style="margin: 12px 0;">
  <img src="https://barcode.orcascan.com/?type=code128&data={{ doc.name }}" style="width: 50mm; height: 12mm; display: block; margin: 0 auto;" />
  <div style="font-family: monospace; font-size: 10px; margin-top: 4px; letter-spacing: 1px;">{{ doc.name }}</div>
</div>

<div class="divider"></div>

{% if doc.custom_qr_code %}
<div class="center" style="margin:8px 0">
  <img src="{{ doc.custom_qr_code }}" style="width:32mm;height:32mm" />
</div>
<div class="divider"></div>
{% endif %}

<div class="center footer-msg">
  <div class="bold">Thank you for shopping with us</div>
  <div class="ar bold" style="margin-top:2px">شكراً لتسوقكم معنا</div>
</div>"""

# ── Template 6: Sales Invoice EN Print (A4 Premium English Layout) ────────────
_SALES_INVOICE_EN_HTML = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap');

.invoice-body {
    font-family: 'Outfit', sans-serif;
    color: #222;
    padding: 15mm 10mm;
    background: #fff;
    max-width: 210mm;
    margin: 0 auto;
    position: relative;
}

.invoice-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 35px;
}

.company-logo-section {
    width: 50%;
}

.invoice-details-section {
    text-align: right;
    width: 45%;
}

.invoice-title {
    font-size: 24px;
    font-weight: 900;
    letter-spacing: 1px;
    color: #111;
    text-transform: uppercase;
}

.items-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 30px;
    margin-bottom: 20px;
}

.items-table th {
    border-top: 1px solid #111;
    border-bottom: 1px solid #111;
    font-weight: 700;
    font-size: 12px;
    color: #111;
    text-transform: uppercase;
}

.items-table td {
    border-bottom: 1px solid #eee;
    font-size: 11.5px;
    color: #333;
}

.totals-table {
    width: 100%;
    border-collapse: collapse;
}

.totals-table td {
    font-size: 12px;
}

.watermark {
    position: absolute;
    top: 45%;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 90px;
    color: rgba(0, 0, 0, 0.04);
    font-weight: 900;
    transform: rotate(-25deg);
    z-index: 1000;
    pointer-events: none;
    user-select: none;
    white-space: nowrap;
}
</style>

<div class="invoice-body">
    {% if doc.docstatus == 0 %}
    <div class="watermark">DRAFT</div>
    {% endif %}

    <!-- Header -->
    <div class="invoice-header">
        <div class="company-logo-section">
            <div style="width: 180px; margin-bottom: 15px;">
                {{ LOGO_SQUARE }}
            </div>
            <div style="font-size: 11px; line-height: 1.6; color: #555;">
                <div class="bold" style="color: #111; font-size: 13px;">{{ doc.company }}</div>
                <div>zouk branch</div>
                <div>Lebanon</div>
                {% if doc.tax_id %}<div>VAT No: <span class="bold">{{ doc.tax_id }}</span></div>{% endif %}
            </div>
        </div>
        <div class="invoice-details-section">
            <div class="invoice-title">INVOICE</div>
            <div style="font-size: 12px; color: #555; margin-top: 8px; line-height: 1.6;">
                <div>Invoice N°: <span class="bold" style="color: #111; font-size: 13px;">{{ doc.name }}</span></div>
                <div style="margin-top: 3px;">Date: <span class="bold" style="color: #111;">{{ doc.posting_date }}</span></div>
            </div>
        </div>
    </div>

    <!-- Parties -->
    <div style="margin-bottom: 35px; margin-top: 15px;">
        <div class="bold" style="font-size: 12px; text-transform: uppercase; color: #111; margin-bottom: 8px; border-bottom: 1px solid #111; padding-bottom: 4px; width: 180px;">Customer Details</div>
        <div style="font-size: 11px; line-height: 1.6; color: #555;">
            <div class="bold" style="color: #111; font-size: 13px;">{{ doc.customer_name or doc.customer }}</div>
            {% if doc.customer_tax_id %}<div>VAT No: <span class="bold">{{ doc.customer_tax_id }}</span></div>{% endif %}
            {% if doc.billing_address_display %}
            <div style="margin-top: 4px;">{{ doc.billing_address_display.replace("<br>", ", ") }}</div>
            {% endif %}
        </div>
    </div>

    <!-- Items Table -->
    <table class="items-table">
        <thead>
            <tr>
                <th style="width: 45%; text-align: left; padding: 12px 10px;">Description / Product</th>
                <th style="width: 10%; text-align: center; padding: 12px 10px;">Qty</th>
                <th style="width: 15%; text-align: right; padding: 12px 10px;">TAX Base</th>
                <th style="width: 15%; text-align: right; padding: 12px 10px;">TAX</th>
                <th style="width: 15%; text-align: right; padding: 12px 10px;">Total</th>
            </tr>
        </thead>
        <tbody>
            {% for item in doc.items %}
            {% set tax_rate = 0 %}
            {% if item.item_tax_rate and item.item_tax_rate != '{}' %}
              {% set tax_rate_dict = json.loads(item.item_tax_rate) %}
              {% for k, v in tax_rate_dict.items() %}
                {% set tax_rate = v %}
              {% endfor %}
            {% endif %}
            {% if tax_rate == 0 and doc.taxes %}
              {% set tax_rate = doc.taxes[0].rate %}
            {% endif %}
            {% set tax_amount = (item.net_amount or item.amount) * (tax_rate / 100.0) %}
            {% set total_amount = (item.net_amount or item.amount) + tax_amount %}
            <tr>
                <td style="padding: 12px 10px;">
                    <div class="bold" style="font-size: 12px; color: #111;">{{ item.item_name or item.item_code }}</div>
                    {% if item.description and item.description != item.item_name %}
                    <div style="font-size: 10px; color: #666; margin-top: 3px;">{{ item.description }}</div>
                    {% endif %}
                </td>
                <td style="text-align: center; padding: 12px 10px;" class="en">{{ item.qty | int }}</td>
                <td style="text-align: right; padding: 12px 10px;" class="en">{{ "{:,.2f}".format(item.net_amount or item.amount or 0) }} {{ doc.currency }}</td>
                <td style="text-align: right; padding: 12px 10px;" class="en">{{ "{:,.2f}".format(tax_amount) }} {{ doc.currency }}</td>
                <td style="text-align: right; padding: 12px 10px; font-weight: bold;" class="en">{{ "{:,.2f}".format(total_amount) }} {{ doc.currency }}</td>
            </tr>
            {% endfor %}
        </tbody>
    </table>

    <!-- Summary & Totals -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 30px;">
        <div style="width: 50%; font-size: 11px; color: #666; line-height: 1.6;">
            {{ doc.terms or "Payment will be made within three months from the issuance of this invoice, it will be made by bank transfer." }}
            
            {% if doc.custom_qr_code %}
            <div style="margin-top: 25px;">
                <img src="{{ doc.custom_qr_code }}" style="width: 30mm; height: 30mm; border: 1px solid #eee;" />
            </div>
            {% endif %}
        </div>
        <div style="width: 45%;">
            <table class="totals-table">
                <tr>
                    <td style="color:#555; padding: 8px 10px; border-bottom: 1px solid #eaeaea;">TAX Base</td>
                    <td style="text-align: right; padding: 8px 10px; border-bottom: 1px solid #eaeaea;" class="en">{{ "{:,.2f}".format(doc.net_total or 0) }} {{ doc.currency }}</td>
                </tr>
                {% for tax in doc.taxes %}
                {% if tax.tax_amount %}
                  {% set ns = namespace(tax_rate=tax.rate or 0) %}
                  {% if ns.tax_rate == 0 and tax.item_wise_tax_detail %}
                    {% set item_tax_dict = json.loads(tax.item_wise_tax_detail) %}
                    {% for k, v in item_tax_dict.items() %}
                      {% if v is sequence %}
                        {% set ns.tax_rate = v[0] %}
                      {% else %}
                        {% set ns.tax_rate = v %}
                      {% endif %}
                    {% endfor %}
                  {% endif %}
                <tr>
                    <td style="color:#555; padding: 8px 10px; border-bottom: 1px solid #eaeaea;">
                        {{ tax.description }}
                        {% if ns.tax_rate > 0 %}({{ ns.tax_rate }}%){% endif %}
                    </td>
                    <td style="text-align: right; padding: 8px 10px; border-bottom: 1px solid #eaeaea;" class="en">{{ "{:,.2f}".format(tax.tax_amount or 0) }} {{ doc.currency }}</td>
                </tr>
                {% endif %}
                {% endfor %}
                {% if doc.discount_amount %}
                <tr>
                    <td style="color:#555; padding: 8px 10px; border-bottom: 1px solid #eaeaea;">Discount</td>
                    <td style="text-align: right; padding: 8px 10px; border-bottom: 1px solid #eaeaea; color: red;" class="en">-{{ "{:,.2f}".format(doc.discount_amount) }} {{ doc.currency }}</td>
                </tr>
                {% endif %}
                <tr class="grand-total">
                    <td style="padding: 12px 10px; font-weight: bold; border-top: 2px solid #111; border-bottom: 2px solid #111; font-size: 14px;">Total</td>
                    <td style="text-align: right; padding: 12px 10px; font-weight: bold; border-top: 2px solid #111; border-bottom: 2px solid #111; font-size: 14px;" class="en">{{ "{:,.2f}".format(doc.grand_total or 0) }} {{ doc.currency }}</td>
                </tr>
            </table>
        </div>
    </div>

    <!-- Stamp Section -->
    <div style="display: flex; justify-content: flex-end; margin-top: 40px; margin-right: 20px;">
        <div style="text-align: center; position: relative; width: 220px;">
            <div style="font-size: 11px; font-weight: bold; color: #333; border-top: 1px solid #ddd; padding-top: 8px; margin-top: 80px;">Authorized Signature</div>
        </div>
    </div>
</div>
"""

# ── Template 7: Sales Invoice AR Print (A4 Premium Arabic Layout) ────────────
_SALES_INVOICE_AR_HTML = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;700;900&display=swap');

.invoice-body {
    font-family: 'Tajawal', sans-serif;
    color: #222;
    padding: 15mm 10mm;
    background: #fff;
    max-width: 210mm;
    margin: 0 auto;
    position: relative;
    direction: rtl;
    text-align: right;
}

.invoice-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 35px;
}

.company-logo-section {
    width: 50%;
}

.invoice-details-section {
    text-align: left;
    width: 45%;
}

.invoice-title {
    font-size: 24px;
    font-weight: 900;
    letter-spacing: 0.5px;
    color: #111;
}

.items-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 30px;
    margin-bottom: 20px;
}

.items-table th {
    border-top: 1px solid #111;
    border-bottom: 1px solid #111;
    font-weight: 700;
    font-size: 12px;
    color: #111;
}

.items-table td {
    border-bottom: 1px solid #eee;
    font-size: 11.5px;
    color: #333;
}

.totals-table {
    width: 100%;
    border-collapse: collapse;
}

.totals-table td {
    font-size: 12px;
}

.watermark {
    position: absolute;
    top: 45%;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 90px;
    color: rgba(0, 0, 0, 0.04);
    font-weight: 900;
    transform: rotate(-25deg);
    z-index: 1000;
    pointer-events: none;
    user-select: none;
    white-space: nowrap;
}
</style>

<div class="invoice-body">
    {% if doc.docstatus == 0 %}
    <div class="watermark">مسودة</div>
    {% endif %}

    <!-- Header -->
    <div class="invoice-header">
        <div class="company-logo-section">
            <div style="width: 180px; margin-bottom: 15px; margin-right: 0; margin-left: auto;">
                {{ LOGO_SQUARE }}
            </div>
            <div style="font-size: 11px; line-height: 1.6; color: #555;">
                <div class="bold" style="color: #111; font-size: 13px;">سلطان جلوبال</div>
                <div>فرع ذوق مصبح</div>
                <div>لبنان</div>
                {% if doc.tax_id %}<div>الرقم الضريبي: <span class="bold">{{ doc.tax_id }}</span></div>{% endif %}
            </div>
        </div>
        <div class="invoice-details-section">
            <div class="invoice-title">فاتورة مبيعات</div>
            <div style="font-size: 12px; color: #555; margin-top: 8px; line-height: 1.6; text-align: left;">
                <div>رقم الفاتورة: <span class="bold" style="color: #111; font-size: 13px;">{{ doc.name }}</span></div>
                <div style="margin-top: 3px;">التاريخ: <span class="bold" style="color: #111;">{{ doc.posting_date }}</span></div>
            </div>
        </div>
    </div>

    <!-- Parties -->
    <div style="margin-bottom: 35px; margin-top: 15px;">
        <div class="bold" style="font-size: 12px; color: #111; margin-bottom: 8px; border-bottom: 1px solid #111; padding-bottom: 4px; width: 120px;">بيانات العميل</div>
        <div style="font-size: 11px; line-height: 1.6; color: #555;">
            <div class="bold" style="color: #111; font-size: 13px;">{{ doc.customer_name or doc.customer }}</div>
            {% if doc.customer_tax_id %}<div>الرقم الضريبي للعميل: <span class="bold">{{ doc.customer_tax_id }}</span></div>{% endif %}
            {% if doc.billing_address_display %}
            <div style="margin-top: 4px;">{{ doc.billing_address_display.replace("<br>", ", ") }}</div>
            {% endif %}
        </div>
    </div>

    <!-- Items Table -->
    <table class="items-table">
        <thead>
            <tr>
                <th style="width: 45%; text-align: right; padding: 12px 10px;">الوصف / المنتج</th>
                <th style="width: 10%; text-align: center; padding: 12px 10px;">الكمية</th>
                <th style="width: 15%; text-align: left; padding: 12px 10px;">الخاضع للضريبة</th>
                <th style="width: 15%; text-align: left; padding: 12px 10px;">الضريبة</th>
                <th style="width: 15%; text-align: left; padding: 12px 10px;">الإجمالي</th>
            </tr>
        </thead>
        <tbody>
            {% for item in doc.items %}
            {% set tax_rate = 0 %}
            {% if item.item_tax_rate and item.item_tax_rate != '{}' %}
              {% set tax_rate_dict = json.loads(item.item_tax_rate) %}
              {% for k, v in tax_rate_dict.items() %}
                {% set tax_rate = v %}
              {% endfor %}
            {% endif %}
            {% if tax_rate == 0 and doc.taxes %}
              {% set tax_rate = doc.taxes[0].rate %}
            {% endif %}
            {% set tax_amount = (item.net_amount or item.amount) * (tax_rate / 100.0) %}
            {% set total_amount = (item.net_amount or item.amount) + tax_amount %}
            <tr>
                <td style="padding: 12px 10px;">
                    <div class="bold" style="font-size: 12px; color: #111;">{{ item.item_name or item.item_code }}</div>
                    {% if item.description and item.description != item.item_name %}
                    <div style="font-size: 10px; color: #666; margin-top: 3px;">{{ item.description }}</div>
                    {% endif %}
                </td>
                <td style="text-align: center; padding: 12px 10px;" class="en">{{ item.qty | int }}</td>
                <td style="text-align: left; padding: 12px 10px;" class="en">{{ "{:,.2f}".format(item.net_amount or item.amount or 0) }} {{ doc.currency }}</td>
                <td style="text-align: left; padding: 12px 10px;" class="en">{{ "{:,.2f}".format(tax_amount) }} {{ doc.currency }}</td>
                <td style="text-align: left; padding: 12px 10px; font-weight: bold;" class="en">{{ "{:,.2f}".format(total_amount) }} {{ doc.currency }}</td>
            </tr>
            {% endfor %}
        </tbody>
    </table>

    <!-- Summary & Totals -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 30px;">
        <div style="width: 50%; font-size: 11px; color: #666; line-height: 1.6;">
            {{ doc.terms or "يتم دفع مستحقات هذه الفاتورة خلال فترة ثلاثة أشهر من تاريخ إصدارها، ويتم السداد عن طريق تحويل بنكي." }}
            
            {% if doc.custom_qr_code %}
            <div style="margin-top: 25px; text-align: right;">
                <img src="{{ doc.custom_qr_code }}" style="width: 30mm; height: 30mm; border: 1px solid #eee;" />
            </div>
            {% endif %}
        </div>
        <div style="width: 45%;">
            <table class="totals-table">
                <tr>
                    <td style="color:#555; padding: 8px 10px; border-bottom: 1px solid #eaeaea;">الخاضع للضريبة</td>
                    <td style="text-align: left; padding: 8px 10px; border-bottom: 1px solid #eaeaea;" class="en">{{ "{:,.2f}".format(doc.net_total or 0) }} {{ doc.currency }}</td>
                </tr>
                {% for tax in doc.taxes %}
                {% if tax.tax_amount %}
                  {% set ns = namespace(tax_rate=tax.rate or 0) %}
                  {% if ns.tax_rate == 0 and tax.item_wise_tax_detail %}
                    {% set item_tax_dict = json.loads(tax.item_wise_tax_detail) %}
                    {% for k, v in item_tax_dict.items() %}
                      {% if v is sequence %}
                        {% set ns.tax_rate = v[0] %}
                      {% else %}
                        {% set ns.tax_rate = v %}
                      {% endif %}
                    {% endfor %}
                  {% endif %}
                <tr>
                    <td style="color:#555; padding: 8px 10px; border-bottom: 1px solid #eaeaea;">
                        {% if "Vat" in tax.description or "Value Added Tax" in tax.description or "ضريبة" in tax.description %}
                          ضريبة القيمة المضافة
                        {% else %}
                          {{ tax.description }}
                        {% endif %}
                        {% if ns.tax_rate > 0 %}({{ ns.tax_rate }}%){% endif %}
                    </td>
                    <td style="text-align: left; padding: 8px 10px; border-bottom: 1px solid #eaeaea;" class="en">{{ "{:,.2f}".format(tax.tax_amount or 0) }} {{ doc.currency }}</td>
                </tr>
                {% endif %}
                {% endfor %}
                {% if doc.discount_amount %}
                <tr>
                    <td style="color:#555; padding: 8px 10px; border-bottom: 1px solid #eaeaea;">الخصم</td>
                    <td style="text-align: left; padding: 8px 10px; border-bottom: 1px solid #eaeaea; color: red;" class="en">-{{ "{:,.2f}".format(doc.discount_amount) }} {{ doc.currency }}</td>
                </tr>
                {% endif %}
                <tr class="grand-total">
                    <td style="padding: 12px 10px; font-weight: bold; border-top: 2px solid #111; border-bottom: 2px solid #111; font-size: 14px;">المجموع الكلي</td>
                    <td style="text-align: left; padding: 12px 10px; font-weight: bold; border-top: 2px solid #111; border-bottom: 2px solid #111; font-size: 14px;" class="en">{{ "{:,.2f}".format(doc.grand_total or 0) }} {{ doc.currency }}</td>
                </tr>
            </table>
        </div>
    </div>

    <!-- Stamp Section -->
    <div style="display: flex; justify-content: flex-end; margin-top: 40px; margin-left: 20px;">
        <div style="text-align: center; position: relative; width: 220px;">
            <div style="font-size: 11px; font-weight: bold; color: #333; border-top: 1px solid #ddd; padding-top: 8px; margin-top: 80px;">التوقيع المعتمد</div>
        </div>
    </div>
</div>
"""


FORMATS = [
    {
        "name": "Sultan Thermal Standard",
        "html": _STANDARD_HTML.replace("__CSS__", _BASE_CSS),
        "description": "80mm standard receipt with header, item table, VAT breakdown, and QR code",
    },
    {
        "name": "Sultan Thermal Standard EN",
        "html": _STANDARD_EN_HTML.replace("__CSS__", _BASE_CSS),
        "description": "80mm standard English receipt for Sultan POS",
    },
    {
        "name": "Sultan Thermal Standard AR",
        "html": _STANDARD_AR_HTML.replace("__CSS__", _BASE_CSS),
        "description": "80mm standard Arabic receipt for Sultan POS",
    },
    {
        "name": "Sultan Thermal Compact",
        "html": _COMPACT_HTML.replace("__CSS__", _BASE_CSS),
        "description": "80mm compact receipt — minimal header, items and total only",
    },
    {
        "name": "Sultan Thermal Bilingual",
        "html": _BILINGUAL_HTML.replace("__CSS__", _BASE_CSS),
        "description": "80mm bilingual (Arabic/English) receipt with QR code",
    },
    {
        "name": "Sultan Sales Invoice EN",
        "html": _SALES_INVOICE_EN_HTML,
        "description": "Premium fully English A4 print format with company logos",
    },
    {
        "name": "Sultan Sales Invoice AR",
        "html": _SALES_INVOICE_AR_HTML,
        "description": "Premium fully Arabic A4 print format with company logos",
    },
]


def create_thermal_print_formats():
    """Create or update the thermal print formats and Sales Invoice print formats."""
    for fmt in FORMATS:
        existing = frappe.db.exists("Print Format", fmt["name"])
        html_content = fmt["html"].replace("{{ LOGO_SQUARE }}", LOGO_SQUARE).replace("{{ LOGO_HORIZONTAL }}", LOGO_HORIZONTAL)
        if not existing:
            doc = frappe.new_doc("Print Format")
            doc.name = fmt["name"]
            doc.doc_type = "Sales Invoice"
            doc.custom_format = 1
            doc.standard = "No"
            doc.print_format_type = "Jinja"
            doc.html = html_content
            doc.description = fmt.get("description", "")
            doc.insert(ignore_permissions=True)
            print(f"Created print format: {fmt['name']}")
        else:
            frappe.db.set_value("Print Format", fmt["name"], {
                "html": html_content,
                "custom_format": 1,
                "standard": "No",
                "print_format_type": "Jinja"
            })
            print(f"Updated print format: {fmt['name']}")

    # Enforce correct monolingual templates on all existing POS Profiles
    frappe.db.sql("UPDATE `tabPOS Profile` SET custom_pos_print_format_en='Sultan Thermal Standard EN', custom_pos_print_format_ar='Sultan Thermal Standard AR', print_format='Sultan Thermal Standard EN'")
    
    # Set default print format for Sales Invoice DocType
    frappe.db.set_value("DocType", "Sales Invoice", "default_print_format", "Sultan Sales Invoice EN")
    
    frappe.db.commit()
