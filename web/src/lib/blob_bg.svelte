<script>
    const blobs = [
        {size:881, x:'-34vw', y:"88vh", color:'--acc_2'},
        {size:616, x:'79vw', y:"-53vh", color:'--acc_1'},
        {size:290, x:'102vw', y:"14vh", color:'--acc_2'}
    ]

</script>

<section class="blobs_wrap">
    <div class="blobs">
        {#each blobs as b}
            <div class="blob" style="background-color: var({b.color}); left:0; top:0; width:{b.size}px; transform: Translate({b.x},{b.y})"></div>
        {/each}
    </div>
</section>

<style lang="scss">
    .blobs_wrap{
        pointer-events: none;
        position: absolute;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        opacity: 0.4;
        overflow: hidden;
    }
    .blobs{
        position: relative;

        .blob{
            position: absolute;
            aspect-ratio: 1/1;
            border-radius: 50%;
            filter: blur(192px);
        }
    }
</style>