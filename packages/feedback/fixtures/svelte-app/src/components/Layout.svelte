<script>
  import Nav from './Nav.svelte';
  let { children } = $props();
</script>

<header>
  <strong>Shop</strong>
  <Nav />
</header>
<main>{@render children?.()}</main>
