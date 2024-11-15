$(document).ready(function(){
    if (window.location.hash && ~modals.indexOf(window.location.hash)) {
        $(window.location.hash).modal();
    }
    $(".modal:not(.noclose)").on("click","a",function(){
        $(this).closest(".modal").modal("hide");
    });

    var currentTimestamp = Date.now();

    $("#ModalCenter").on("hidden.bs.modal", function () {
        localStorage.setItem("last-showed-at", currentTimestamp);
    });

    // Check for modal eligibility
    var showAgainInMs = 86400000;
    var lastTimestamp = Number(localStorage.getItem("last-showed-at"));

    if ((currentTimestamp - lastTimestamp) >= showAgainInMs) {
        setTimeout(function() {
            localStorage.setItem("last-showed-at", currentTimestamp);
            $("#ModalCenter").modal("show");
        }, 3000);
    }
});

$('#reset-session').on('click',function(){
  localStorage.clear();
});



lightBoxClose = function() {
  document.querySelector(".lightbox").classList.add("closed");
}

/* Toggle between adding and removing the "responsive" class to topnav when the user clicks on the icon */
function myFunction() {
  var x = document.getElementById("myTopnav");
  if (x.className === "topnav") {
    x.className += " responsive";
  } else {
    x.className = "topnav";
  }
}

$(document).ready(function() {
    // Gemeinsame Funktion für die Animationen
    function showModal() {
        $("#mupif").fadeIn();
        $("#loading-circle").fadeIn();
        $("#lock-modal").fadeIn('slow');
    }

    // Event-Handler für alle Links
    $('a').on("click", function(e) {
        const href = $(this).attr('href');

        // Prüfen, ob der Link ein Ziel hat (kein JavaScript:void(0) oder Anker)
        if (href && href !== "#" && !href.startsWith('javascript')) {
            e.preventDefault(); // Verhindert sofortiges Navigieren
            showModal();

            // Nach der Animation navigieren
            setTimeout(function() {
                window.location.href = href;
            }, 1000); // Verzögerung in Millisekunden
        }
    });

    // Event-Handler für Formulare
    $('#remform, #form').on("submit", function() {
        showModal();
    });

    // Event-Handler für den Button mit ID 'loading'
    $('#loading').click(function() {
        showModal();
    });
});

// This is the code to preload the images
var imageList = Array();
imageList['blue'] = new Image(150, 250);
imageList['blue'].src = "images/blue.png";
imageList['deepblue'] = new Image(150, 250);
imageList['deepblue'].src = "images/deepblue.png";
imageList['purple'] = new Image(150, 250);
imageList['purple'].src = "images/purple.png";
imageList['pink'] = new Image(150, 250);
imageList['pink'].src = "images/pink.png";
imageList['green'] = new Image(150, 250);
imageList['green'].src = "images/green.png";
imageList['darkred'] = new Image(150, 250);
imageList['darkred'].src = "images/darkred.png";
imageList['red'] = new Image(150, 250);
imageList['red'].src = "images/red.png";
imageList['orange'] = new Image(150, 250);
imageList['orange'].src = "images/orange.png";
imageList['chocolate'] = new Image(150, 250);
imageList['chocolate'].src = "images/chocolate.png";
imageList['vintage'] = new Image(150, 250);
imageList['vintage'].src = "images/vintage.png";
imageList['dark'] = new Image(150, 250);
imageList['dark'].src = "images/dark.png";
imageList['light'] = new Image(150, 250);
imageList['light'].src = "images/light.png";
imageList['xmas'] = new Image(150, 250);
imageList['xmas'].src = "images/xmas.png";
imageList['matrix'] = new Image(150, 250);
imageList['matrix'].src = "images/matrix.png";
imageList['wood'] = new Image(150, 250);
imageList['wood'].src = "images/wood.png";
imageList['mint'] = new Image(150, 250);
imageList['mint'].src = "images/mint.png";
imageList['danger'] = new Image(150, 250);
imageList['danger'].src = "images/danger.png";
imageList['ironman'] = new Image(150, 250);
imageList['ironman'].src = "images/ironman.png";
imageList['captainamerica'] = new Image(150, 250);
imageList['captainamerica'].src = "images/captainamerica.png";
imageList['cinema'] = new Image(150, 250);
imageList['cinema'].src = "images/cinema.png";
imageList['earth'] = new Image(150, 250);
imageList['earth'].src = "images/earth.png";
imageList['steampunk'] = new Image(150, 250);
imageList['steampunk'].src = "images/steampunk.png";
imageList['fantasybutterflies'] = new Image(150, 250);
imageList['fantasybutterflies'].src = "images/fantasybutterflies.png";
imageList['lines'] = new Image(150, 250);
imageList['lines'].src = "images/lines.png";
imageList['forms'] = new Image(150, 250);
imageList['forms'].src = "images/forms.png";
imageList['comic'] = new Image(150, 250);
imageList['comic'].src = "images/comic.png";
imageList['mystic'] = new Image(150, 250);
imageList['mystic'].src = "images/mystic.png";
imageList['clone-wars'] = new Image(150, 250);
imageList['clone-wars'].src = "images/clone-wars.png";
imageList['enterprise'] = new Image(150, 250);
imageList['enterprise'].src = "images/enterprise.png";
imageList['spiderman'] = new Image(150, 250);
imageList['spiderman'].src = "images/spiderman.png";
imageList['supermario'] = new Image(150, 250);
imageList['supermario'].src = "images/supermario.png";
imageList['pikachu'] = new Image(150, 250);
imageList['pikachu'].src = "images/pikachu.png";
imageList['dinosaur'] = new Image(150, 250);
imageList['dinosaur'].src = "images/dinosaur.png";
imageList['unicorn'] = new Image(150, 250);
imageList['unicorn'].src = "images/unicorn.png";
imageList['axolotl'] = new Image(150, 250);
imageList['axolotl'].src = "images/axolotl.png";
imageList['custom'] = new Image(150, 250);
imageList['custom'].src = "images/custom.png";

function switchImage() {
    var selectedImage = document.mupi.theme.options[document.mupi.theme.selectedIndex].value;
    document.selectedTheme.src = imageList[selectedImage].src;
}
