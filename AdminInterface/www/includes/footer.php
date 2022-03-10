			<div id="footer">
				<div id="footerleft">
					<ul>
						<li><a href="https://mupibox.de/" target="_blank">MuPiBox.de</a></li>
						<li><a href="https://discord.gg/4EjCgpCbbe" target="_blank">Support on Discord</a></li>
					</ul>
				</div>
				<div id="footercenter">
					<ul>
						<li><a href="https://github.com/splitti/MuPiBox" target="_blank">Visit MupiBox on Github</a></li>
						<li><a href="https://github.com/splitti/MuPiBox/blob/main/LICENSE.md" target="_blank">License / Copyright</a></li>						
					</ul>
				</div>
				<div id="footerright">
					<img id="mupi" src="images/mupi.png" alt="">
				</div>

			</div>
			<div id="lock-modal"></div>
			<div id="loading-circle"></div>
		</div>
		<img id="bottom" src="images/bottom.png" alt="">
	</body>
<?php
	if (!isset($_SESSION)) {
		session_start();
	}

	if ($_SERVER['REQUEST_METHOD'] == 'POST') {
		$_SESSION['postdata'] = $_POST;
		unset($_POST);
		header("Location: ".$_SERVER['PHP_SELF']);
		exit;
	}
?>
</html>
