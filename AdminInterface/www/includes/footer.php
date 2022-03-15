
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
<?php
	if( $change )
		{
		print '<div class="lightbox"><div class="iframeContainer"><div class="toolbarLB"><span class="closeLB" onclick="lightBoxClose()">x</span></div><p>'.$CHANGE_TXT.'Data succesfully saved!</p></div></div>';
		} 
?>
	</body>
</html>
